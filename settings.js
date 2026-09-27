const fs = require("fs");
const path = require("path");

const SETTINGS_PATH = path.join(__dirname, "settings.json");

const DEFAULT_CHAPTER_PATTERNS = [
    "^\\s*第\\s*[0-9零一二三四五六七八九十百千万两]+\\s*章.*$",
    "^\\s*Chapter\\s+\\d+.*$",
    "^\\s*第\\s*[0-9零一二三四五六七八九十百千万两]+\\s*节.*$",
];

const DEFAULTS = {
    chunking: {
        mode: "auto",
        chapterPatterns: DEFAULT_CHAPTER_PATTERNS,
        minChars: 300,
        maxChars: 1200,
    },
    neighbors: {
        enabled: false,
        back: 1,
        forward: 1,
    },
    chapterGate: {
        enabled: false,
        regex: "第\\s*([0-9零一二三四五六七八九十百千万两]+)\\s*章",
    },
    contextual: {
        enabled: false,
        chat: { url: "", key: "", model: "" },
        maxContextChars: 160,
        neighborChars: 700,
    },
    outline: {
        ttlMs: 15000,
    },
};

function isPlainObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(base, override) {
    if (!isPlainObject(base) || !isPlainObject(override)) {
        return override === undefined ? base : override;
    }
    const out = { ...base };
    for (const key of Object.keys(override)) {
        const baseValue = out[key];
        const overrideValue = override[key];
        out[key] =
            isPlainObject(baseValue) && isPlainObject(overrideValue)
                ? deepMerge(baseValue, overrideValue)
                : overrideValue;
    }
    return out;
}

function readFileSettings() {
    try {
        if (!fs.existsSync(SETTINGS_PATH)) return {};
        const parsed = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf8"));
        return isPlainObject(parsed) ? parsed : {};
    } catch (e) {
        console.warn(
            `[Anima Settings] ⚠️ 读取 settings.json 失败，回退默认值: ${e.message}`,
        );
        return {};
    }
}

let cache = null;
let cacheMtime = -1;

function ensureSettingsFile() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) return false;
        fs.writeFileSync(
            SETTINGS_PATH,
            JSON.stringify(DEFAULTS, null, 2),
            "utf8",
        );
        console.log(`[Anima Settings] ✅ 已生成默认配置: ${SETTINGS_PATH}`);
        return true;
    } catch (e) {
        console.warn(`[Anima Settings] ⚠️ 生成默认配置失败: ${e.message}`);
        return false;
    }
}

function getAnimaSettings() {
    let mtime = -1;
    try {
        mtime = fs.statSync(SETTINGS_PATH).mtimeMs;
    } catch (e) {
        mtime = -1;
    }
    if (cache && mtime === cacheMtime) return cache;
    cacheMtime = mtime;
    cache = deepMerge(DEFAULTS, readFileSettings());
    return cache;
}

module.exports = {
    DEFAULTS,
    DEFAULT_CHAPTER_PATTERNS,
    SETTINGS_PATH,
    deepMerge,
    ensureSettingsFile,
    getAnimaSettings,
};
