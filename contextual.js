const MAX_DEFAULT = 160;

/**
 * 构造用于生成「切片语境」的消息（纯函数，便于单测）。
 */
function buildContextMessages({
    docName,
    chapterTitle,
    prevText,
    chunkText,
    nextText,
    maxContextChars,
} = {}) {
    const limit =
        Number.isFinite(Number(maxContextChars)) && Number(maxContextChars) > 0
            ? Math.floor(Number(maxContextChars))
            : MAX_DEFAULT;

    const system =
        "你是检索索引助手。给你一段小说原文及其上下文，请用一句中文概括这片段的语境：" +
        "发生在哪一章、此时剧情进展到哪、本片段在讲什么。" +
        "只输出概括本身，不要引号、不要换行、不要解释、不要罗列人名清单。";

    let user = "";
    if (docName) user += `作品/文件：${docName}\n`;
    if (chapterTitle) user += `所属章节：${chapterTitle}\n`;
    if (prevText) user += `\n【前文摘录】\n${prevText}\n`;
    user += `\n【本片段】\n${chunkText || ""}\n`;
    if (nextText) user += `\n【后文摘录】\n${nextText}\n`;
    user += `\n请给出这一片段的语境概括（不超过 ${limit} 字）。`;

    return [
        { role: "system", content: system },
        { role: "user", content: user },
    ];
}

/**
 * 清洗模型返回的语境：去引号、压空白、限长。
 */
function sanitizeContext(text, maxContextChars) {
    const limit =
        Number.isFinite(Number(maxContextChars)) && Number(maxContextChars) > 0
            ? Math.floor(Number(maxContextChars))
            : MAX_DEFAULT;
    let s = String(text === undefined || text === null ? "" : text).trim();
    s = s.replace(/^["“”'‘’《》]+/, "").replace(/["“”'‘’《》]+$/, "");
    s = s.replace(/\s*\n+\s*/g, " ").replace(/\s{2,}/g, " ").trim();
    if (s.length > limit) s = s.slice(0, limit);
    return s;
}

/**
 * 拼装最终用于 embedding 的文本：语境 + 原文。
 */
function buildEmbeddingText(context, chunkText) {
    const ctx = sanitizeContext(context, 10000);
    const body = String(chunkText === undefined || chunkText === null ? "" : chunkText);
    return ctx ? `${ctx}\n${body}` : body;
}

module.exports = {
    buildContextMessages,
    buildEmbeddingText,
    sanitizeContext,
};
