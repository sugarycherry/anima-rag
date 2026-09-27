#!/usr/bin/env bash
# ============================================================
# Anima RAG 一键更新脚本（Termux / Linux / macOS）
#
# 用法：
#   bash update.sh                     # 自动定位 SillyTavern
#   bash update.sh /路径/到/SillyTavern  # 手动指定
#   ST_DIR=~/SillyTavern bash update.sh # 用环境变量指定
#
# 作用：
#   · 后端插件 plugins/anima-rag  —— 切到你的 fork、拉取、npm install
#   · 前端扩展 data/default-user/extensions/Anima-Memory-System —— 切到你的 fork、拉取
#   · 检查 config.yaml 的 enableServerPlugins
#   · 不会动你的 vectors/ 与 settings.json（已被 .gitignore 忽略）
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
command -v npm >/dev/null 2>&1 || die "未安装 node/npm（Termux: pkg install nodejs）"

sync_repo() { # $1=目录 $2=fork地址 $3=名称
  local dir="$1" url="$2" name="$3"
  if [ -d "$dir/.git" ]; then
    info "$name 已安装，切换到你的 fork 并更新…"
    git -C "$dir" remote set-url origin "$url.git" 2>/dev/null || git -C "$dir" remote add origin "$url.git"
    git -C "$dir" fetch origin main || die "$name 拉取失败（检查网络）"
    git -C "$dir" checkout -q -B main origin/main 2>/dev/null || git -C "$dir" reset --hard origin/main
    ok "$name 已更新到 $(git -C "$dir" log --format='%h %s' -1)"
  elif [ -d "$dir" ]; then
    info "$name 存在但不是 git 仓库，备份后重新克隆…"
    mv "$dir" "$dir.bak.$(date +%s)"
    git clone "$url.git" "$dir" || die "$name 克隆失败"
    ok "$name 已重新克隆"
    warn "旧目录已备份在 $dir.bak.*"
  else
    info "$name 未安装，开始克隆…"
    mkdir -p "$(dirname "$dir")"
    git clone "$url.git" "$dir" || die "$name 克隆失败"
    ok "$name 已安装"
  fi
}

# ---------- 2. 后端插件 ----------
PLUG="$ST/plugins/anima-rag"
info "后端插件: $PLUG"
sync_repo "$PLUG" "$FORK_BACK" "后端 anima-rag"

info "安装后端依赖（npm install，首次会稍慢）…"
( cd "$PLUG" && npm install --no-audit --no-fund ) || die "npm install 失败"
ok "后端依赖就绪"

# ---------- 3. 检查插件开关 ----------
if grep -qE '^[[:space:]]*enableServerPlugins:[[:space:]]*true' "$ST/config.yaml"; then
  ok "config.yaml 已启用服务器插件"
else
  warn "config.yaml 里 enableServerPlugins 不是 true，插件不会加载！请执行："
  printf '      sed -i "s/^enableServerPlugins:.*/enableServerPlugins: true/" "%s/config.yaml"\n' "$ST"
fi

# ---------- 4. 前端扩展 ----------
EXT="$ST/data/default-user/extensions/$FRONT_DIR_NAME"
info "前端扩展: $EXT"
sync_repo "$EXT" "$FORK_FRONT" "前端 $FRONT_DIR_NAME"

# ---------- 5. 完成 ----------
echo
ok "全部完成！最后一步：重启 SillyTavern，然后刷新网页"
echo "    · 先 Ctrl+C 停掉当前酒馆进程，再执行："
echo "        cd \"$ST\" && node server.js"
echo "    · 前端新控件位置：Anima 侧边栏 → 知识库"
echo "        （邻接前后文 / 章节闸门 / 结果重排 / 切片模式 / 上下文检索）"
echo "    · 你的 vectors/ 与 settings.json 不会被覆盖"
echo "    · 更新完想回退：git -C \"$PLUG\" log --oneline  然后 git -C \"$PLUG\" checkout <旧提交>"
