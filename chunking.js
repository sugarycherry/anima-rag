const { DEFAULT_CHAPTER_PATTERNS } = require("./settings");

const DEFAULT_MIN_CHARS = 300;
const DEFAULT_MAX_CHARS = 1200;
const DEFAULT_LEGACY_CHUNK_SIZE = 500;

const CN_DIGITS = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
};
const CN_UNITS = { 十: 10, 百: 100, 千: 1000 };
const SENTENCE_END = /(?<=[。！？；!?;…])/;

function toPositiveInt(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 解析中文/阿拉伯数字。返回 null 表示无法解析。
 */
function parseCnNumber(input) {
    if (input === undefined || input === null) return null;
    const s = String(input).replace(/\s/g, "");
    if (s === "") return null;
    if (/^\d+$/.test(s)) return parseInt(s, 10);

    let total = 0;
    let section = 0;
    let number = 0;
    let hasNumber = false;
    let matched = false;

    for (const ch of s) {
        if (Object.prototype.hasOwnProperty.call(CN_DIGITS, ch)) {
            number = CN_DIGITS[ch];
            hasNumber = true;
            matched = true;
        } else if (Object.prototype.hasOwnProperty.call(CN_UNITS, ch)) {
            const unit = CN_UNITS[ch];
            if (!hasNumber) number = 1;
            section += number * unit;
            number = 0;
            hasNumber = false;
            matched = true;
        } else if (ch === "万") {
            section += hasNumber ? number : 0;
            total += section * 10000;
            section = 0;
            number = 0;
            hasNumber = false;
            matched = true;
        } else if (ch === "亿") {
            section += hasNumber ? number : 0;
            total = (total + section) * 100000000;
            section = 0;
            number = 0;
            hasNumber = false;
            matched = true;
        }
    }

    section += hasNumber ? number : 0;
    const result = total + section;
    return matched && result > 0 ? result : null;
}

function compileChapterRegexes(patterns) {
    const list =
        Array.isArray(patterns) && patterns.length > 0
            ? patterns
            : DEFAULT_CHAPTER_PATTERNS;
    const out = [];
    for (const pattern of list) {
        if (typeof pattern !== "string" || pattern.trim() === "") continue;
        try {
            out.push(new RegExp(pattern));
        } catch (e) {
            console.warn(
                `[Anima Chunking] ⚠️ 忽略无效的章标题正则: ${pattern} (${e.message})`,
            );
        }
    }
    return out;
}

function findHeadingLine(text, regexes) {
    if (!text || !regexes || regexes.length === 0) return null;
    const lines = String(text).split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        for (const re of regexes) {
            re.lastIndex = 0;
            if (re.test(trimmed)) return trimmed;
        }
    }
    return null;
}

function extractChapterNumber(heading) {
    if (!heading) return null;
    const digitMatch = String(heading).match(/\d+/);
    if (digitMatch) return parseInt(digitMatch[0], 10);
    const cnMatch = String(heading).match(/[零一二两三四五六七八九十百千万]+/);
    if (cnMatch) return parseCnNumber(cnMatch[0]);
    return null;
}

/**
 * 按章标题切分，返回 [{ title, body, chapterIndex }]。
 * 无章标题时返回 []，交由调用方回退。
 */
function detectChapters(text, patterns) {
    const regexes = compileChapterRegexes(patterns);
    if (regexes.length === 0) return [];

    const lines = String(text == null ? "" : text).split(/\r?\n/);
    const chapters = [];
    let current = null;
    let preamble = null;
    let sequential = 0;

    for (const line of lines) {
        const heading = findHeadingLine(line, regexes);
        if (heading) {
            sequential += 1;
            const parsed = extractChapterNumber(heading);
            current = {
                title: heading,
                lines: [line],
                chapterIndex: parsed !== null && parsed > 0 ? parsed : sequential,
            };
            chapters.push(current);
        } else if (current) {
            current.lines.push(line);
        } else {
            if (preamble === null) preamble = [];
            preamble.push(line);
        }
    }

    if (chapters.length === 0) return [];

    const out = [];
    if (preamble && preamble.join("").trim() !== "") {
        out.push({
            title: "",
            body: preamble.join("\n"),
            chapterIndex: 0,
        });
    }
    for (const chapter of chapters) {
        out.push({
            title: chapter.title,
            body: chapter.lines.join("\n"),
            chapterIndex: chapter.chapterIndex,
        });
    }
    return out;
}

function splitParagraphs(text) {
    return String(text == null ? "" : text)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
}

/**
 * 超长文本按句末标点切，绝不从句中间硬切（单句本身超长时才兜底硬切）。
 */
function splitLong(text, maxChars) {
    const parts = String(text).split(SENTENCE_END);
    const out = [];
    let buf = "";
    for (const part of parts) {
        if (buf && buf.length + part.length > maxChars) {
            out.push(buf);
            buf = "";
        }
        buf += part;
        while (buf.length > maxChars) {
            out.push(buf.slice(0, maxChars));
            buf = buf.slice(maxChars);
        }
    }
    if (buf) out.push(buf);
    return out;
}

/**
 * 长度带修正：过长再切、过短向后合并，末尾孤块并入前一块。
 */
function applyLengthBand(pieces, { minChars, maxChars }) {
    const list = [];
    for (const piece of pieces) {
        if (piece.length > maxChars) list.push(...splitLong(piece, maxChars));
        else list.push(piece);
    }

    const merged = [];
    for (let i = 0; i < list.length; i++) {
        let current = list[i];
        if (current.length < minChars) {
            let j = i + 1;
            while (
                j < list.length &&
                current.length < minChars &&
                current.length + list[j].length + 1 <= maxChars
            ) {
                current = `${current}\n${list[j]}`;
                j++;
            }
            i = j - 1;
        }
        merged.push(current);
    }

    if (merged.length > 1 && merged[merged.length - 1].length < minChars) {
        const tail = merged.pop();
        merged[merged.length - 1] = `${merged[merged.length - 1]}\n${tail}`;
    }

    return merged;
}

function chunkChapterBody(body, { minChars, maxChars }) {
    const paragraphs = splitParagraphs(body);
    const pieces = [];
    let buffer = "";

    for (const paragraph of paragraphs) {
        if (paragraph.length > maxChars) {
            if (buffer) {
                pieces.push(buffer);
                buffer = "";
            }
            pieces.push(...splitLong(paragraph, maxChars));
            continue;
        }
        if (buffer && buffer.length + paragraph.length + 1 > maxChars) {
            pieces.push(buffer);
            buffer = "";
        }
        buffer = buffer ? `${buffer}\n${paragraph}` : paragraph;
    }
    if (buffer) pieces.push(buffer);

    return applyLengthBand(pieces, { minChars, maxChars });
}

/**
 * 旧版切片逻辑（保持原行为），仅在 auto 模式检不出章标题时兜底。
 */
function legacyChunk(text, opts = {}) {
    const delimiter = opts.legacyDelimiter;
    const chunkSize = toPositiveInt(
        opts.legacyChunkSize,
        DEFAULT_LEGACY_CHUNK_SIZE,
    );
    const source = String(text == null ? "" : text);

    if (delimiter && String(delimiter).trim() !== "") {
        return source
            .split(delimiter)
            .map((t) => t.trim())
            .filter((t) => t.length > 0);
    }

    const chunks = [];
    let startIndex = 0;
    const totalLen = source.length;

    while (startIndex < totalLen) {
        let endIndex = startIndex + chunkSize;
        if (endIndex >= totalLen) {
            endIndex = totalLen;
        } else {
            const searchWindow = source.substring(endIndex, endIndex + 100);
            let offset = searchWindow.indexOf("\n");
            if (offset === -1) {
                const punctuationMatch = searchWindow.match(/[。.?!？！]/);
                if (punctuationMatch) offset = punctuationMatch.index;
            }
            if (offset !== -1) endIndex += offset + 1;
        }
        const chunk = source.substring(startIndex, endIndex).trim();
        if (chunk) chunks.push(chunk);
        startIndex = endIndex;
    }
    return chunks;
}

/**
 * 主入口：章节感知切片。
 * @param {string} text
 * @param {object} opts { mode, chapterPatterns, minChars, maxChars, legacyDelimiter, legacyChunkSize }
 * @returns {Array<{text, chapterIndex, chapterTitle, chunkIndex, chunkInChapter}>}
 */
function chunkDocument(text, opts = {}) {
    const mode = opts.mode || "auto";
    const minChars = toPositiveInt(opts.minChars, DEFAULT_MIN_CHARS);
    const maxChars = Math.max(
        toPositiveInt(opts.maxChars, DEFAULT_MAX_CHARS),
        minChars,
    );

    if (mode !== "legacy") {
        const chapters = detectChapters(text, opts.chapterPatterns);
        if (chapters.length > 0) {
            const out = [];
            let globalIndex = 0;
            for (const chapter of chapters) {
                const pieces = chunkChapterBody(chapter.body, {
                    minChars,
                    maxChars,
                });
                pieces.forEach((piece, i) => {
                    out.push({
                        text: piece,
                        chapterIndex: chapter.chapterIndex,
                        chapterTitle: chapter.title,
                        chunkIndex: globalIndex++,
                        chunkInChapter: i,
                    });
                });
            }
            if (out.length > 0) return out;
        }
    }

    return legacyChunk(text, opts).map((piece, i) => ({
        text: piece,
        chapterIndex: null,
        chapterTitle: null,
        chunkIndex: i,
        chunkInChapter: i,
    }));
}

module.exports = {
    applyLengthBand,
    chunkChapterBody,
    chunkDocument,
    compileChapterRegexes,
    detectChapters,
    extractChapterNumber,
    findHeadingLine,
    legacyChunk,
    parseCnNumber,
    splitLong,
};
