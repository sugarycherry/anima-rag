const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildContextMessages,
    buildEmbeddingText,
    sanitizeContext,
} = require("../contextual");

test("buildContextMessages produces a system + user pair with the chunk", () => {
    const messages = buildContextMessages({
        docName: "novel.txt",
        chapterTitle: "第一章 起点",
        prevText: "前文",
        chunkText: "本片段正文",
        nextText: "后文",
        maxContextChars: 60,
    });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].role, "system");
    assert.equal(messages[1].role, "user");
    assert.ok(messages[1].content.includes("本片段正文"));
    assert.ok(messages[1].content.includes("第一章 起点"));
    assert.ok(messages[1].content.includes("前文"));
    assert.ok(messages[1].content.includes("后文"));
    assert.ok(messages[1].content.includes("60"));
});

test("buildContextMessages tolerates missing context fields", () => {
    const messages = buildContextMessages({ chunkText: "只有正文" });
    assert.equal(messages.length, 2);
    assert.ok(messages[1].content.includes("只有正文"));
});

test("sanitizeContext strips wrapping quotes and collapses whitespace", () => {
    assert.equal(
        sanitizeContext("“第一章开头，青雄送子。”", 100),
        "第一章开头，青雄送子。",
    );
    assert.equal(sanitizeContext("第一行\n\n第二行", 100), "第一行 第二行");
    assert.equal(sanitizeContext("  多余空格   很多  ", 100), "多余空格 很多");
});

test("sanitizeContext enforces the length limit", () => {
    const long = "啊".repeat(300);
    assert.equal(sanitizeContext(long, 20).length, 20);
    assert.equal(sanitizeContext(long).length, 160);
});

test("buildEmbeddingText prepends context and keeps the original text intact", () => {
    assert.equal(buildEmbeddingText("语境", "原文"), "语境\n原文");
    assert.equal(buildEmbeddingText("", "原文"), "原文");
    assert.equal(buildEmbeddingText(null, "原文"), "原文");
});
