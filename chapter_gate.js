const { parseCnNumber } = require("./chunking");

function toPositiveInt(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

/**
 * 解析“当前章节”闸门值。
 * 1. 请求字段 kbStrategy.current_chapter 优先；
 * 2. 否则（且开关打开）用可配置正则扫 searchText，取最大值；
 * 3. 都拿不到返回 null（不启用闸门）。
 */
function resolveChapterGate({ searchText, kbStrategy = {}, animaSettings = {} }) {
    const strategy = kbStrategy || {};

    const explicit = toPositiveInt(
        strategy.current_chapter !== undefined
            ? strategy.current_chapter
            : strategy.currentChapter,
    );
    if (explicit !== null) return explicit;

    const gate = (animaSettings && animaSettings.chapterGate) || {};
    const frontendEnabled = strategy.chapter_gate_enabled;
    const enabled =
        frontendEnabled === undefined
            ? gate.enabled === true
            : frontendEnabled === true;
    if (!enabled) return null;

    const customRegex =
        typeof strategy.chapter_gate_regex === "string"
            ? strategy.chapter_gate_regex.trim()
            : "";
    const source = customRegex || gate.regex;
    if (!source) return null;

    let regex;
    try {
        regex = new RegExp(source, "g");
    } catch (e) {
        console.warn(
            `[Anima ChapterGate] ⚠️ 无效的章节正则，已跳过: ${source}`,
        );
        return null;
    }

    const haystack = String(searchText == null ? "" : searchText);
    let match;
    let max = null;
    while ((match = regex.exec(haystack)) !== null) {
        const raw = match[1] !== undefined ? match[1] : match[0];
        const value = parseCnNumber(raw);
        if (value !== null && (max === null || value > max)) max = value;
        if (match.index === regex.lastIndex) regex.lastIndex++;
    }
    return max;
}

module.exports = { resolveChapterGate };
