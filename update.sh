#!/usr/bin/env bash
# ============================================================
# Anima 一键回退更新（Termux / Linux / macOS）
#
# 用法：
#   bash update.sh                     # 自动定位 SillyTavern
#   bash update.sh /路径/到/SillyTavern  # 手动指定
#   ST_DIR=~/SillyTavern bash update.sh # 用环境变量指定
#
# 行为（“回退”语义）：
#   · 后端 plugins/anima-rag  —— 切到你的 fork → fetch → reset --hard origin/main（丢弃本地改动）
#   · 前端 extensions/Anima-Memory-System —— 同上
#   · 后端补依赖 npm install
#   · 检查 config.yaml 的 enableServerPlugins
#   · 不会动 vectors/ 与 settings.json（已 .gitignore）
#
# 说明：reset --hard 可处理“远端被强推/历史改写”的情况（普通 git pull 会失败）。
# ============================================================

set -u

FORK_BACK="https://github.com/sugarycherry/anima-rag"
FORK_FRONT="https://github.com/sugarycherry/Anima-Memory-System"
FRONT_DIR_NAME="Anima-Memory-System"

info() { printf "\033[36m[Anima更新]\033[0m %s\n" "$*"; }
ok()   { printf "\033[32m  [OK] %s\033[0m\n" "$*"; }
warn() { printf "\033[33m  [注意] %s\033[0m\n" "$*"; }
die()  { printf "\033[31m  [失败] %s\033[0m\n" "$*"; exit 1; }

# ---------- 1. 定位 SillyTavern ----------
ST=""
if [ "${1:-}" != "" ] && [ -d "${1:-}" ]; then ST="$1"; fi
if [ -z "$ST" ] && [ "${ST_DIR:-}" != "" ] && [ -d "${ST_DIR:-}" ]; then ST="$ST_DIR"; fi
if [ -z "$ST" ]; then
  for c in "$HOME/SillyTavern" "$HOME/sillytavern" "$PWD/SillyTavern" "$PWD"; do
    if [ -f "$c/config.yaml" ] && [ -d "$c/public" ]; then ST="$c"; break; fi
  done
fi
[ -z "$ST" ] && die "找不到 SillyTavern 目录。请用：bash update.sh /你的/酒馆/路径"
ST="$(cd "$ST" && pwd)"
info "SillyTavern 目录: $ST"

command -v git >/dev/null 2>&1 || die "未安装 git（Termux: pkg install git）"

# 一键回退更新：切 fork → fetch → reset --hard origin/main
sync_repo() { # $1=目录 $2=fork地址 $3=名称
  local dir="$1" url="$2" name="$3" before after
  if [ -d "$dir/.git" ]; then
    info "$name: 回退更新中（丢弃本地未提交改动）…"
    git -C "$dir" remote set-url origin "$url.git" 2>/dev/null || git -C "$dir" remote add origin "$url.git"
    git -C "$dir" fetch origin main || die "$name 拉取失败（检查网络）"
    before="$(git -C "$dir" rev-parse --short HEAD 2>/dev/null || echo none)"
    git -C "$dir" reset --hard origin/main || die "$name 回退失败"
    after="$(git -C "$dir" log --format='%h %s' -1)"
    if [ "$before" = "$(printf '%s' "$after" | cut -d' ' -f1)" ]; then
      ok "$name: 已是最新 ($after)"
    else
      ok "$name: $before → $after"
    fi
  elif [ -d "$dir" ]; then
    info "$name: 不是 git 仓库，备份后重新克隆…"
    mv "$dir" "$dir.bak.$(date +%s)"
    git clone "$url.git" "$dir" || die "$name 克隆失败"
    ok "$name: 已重新克隆"
    warn "旧目录已备份在 $dir.bak.*"
  else
    info "$name: 未安装，开始克隆…"
    mkdir -p "$(dirname "$dir")"
    git clone "$url.git" "$dir" || die "$name 克隆失败"
    ok "$name: 已安装"
  fi
}

# ---------- 2. 后端 ----------
PLUG="$ST/plugins/anima-rag"
info "后端: $PLUG"
sync_repo "$PLUG" "$FORK_BACK" "后端 anima-rag"

if command -v npm >/dev/null 2>&1; then
  info "安装/校验后端依赖（npm install）…"
  ( cd "$PLUG" && npm install --no-audit --no-fund ) || warn "npm install 失败（可稍后手动执行）"
  ok "后端依赖就绪"
else
  warn "未安装 node/npm（Termux: pkg install nodejs），已跳过依赖安装"
fi

# ---------- 3. 插件开关 ----------
if grep -qE '^[[:space:]]*enableServerPlugins:[[:space:]]*true' "$ST/config.yaml"; then
  ok "config.yaml 已启用服务器插件"
else
  warn "config.yaml 里 enableServerPlugins 不是 true，插件不会加载！请执行："
  printf '      sed -i "s/^enableServerPlugins:.*/enableServerPlugins: true/" "%s/config.yaml"\n' "$ST"
fi

# ---------- 4. 前端 ----------
EXT="$ST/data/default-user/extensions/$FRONT_DIR_NAME"
info "前端: $EXT"
sync_repo "$EXT" "$FORK_FRONT" "前端 $FRONT_DIR_NAME"

# ---------- 5. 收尾 ----------
echo
ok "全部完成！最后两步："
echo "    1) 重启酒馆：先 Ctrl+C 停掉，再执行：  cd \"$ST\" && node server.js"
echo "    2) 手机浏览器：清除本站点缓存后重新打开 http://127.0.0.1:8000"
echo "    · 你的 vectors/ 与 settings.json 不会被覆盖"
echo "    · 想回退到某个旧提交： git -C \"$PLUG\" log --oneline  然后 git -C \"$PLUG\" checkout <提交号>"
