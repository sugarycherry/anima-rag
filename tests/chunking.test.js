const test = require("node:test");
const assert = require("node:assert/strict");

const {
    chunkDocument,
    detectChapters,
    extractChapterNumber,
    parseCnNumber,
    findHeadingLine,
    compileChapterRegexes,
} = require("../chunking");

test("parseCnNumber handles chinese and arabic numerals", () => {
    assert.equal(parseCnNumber("一"), 1);
    assert.equal(parseCnNumber("十"), 10);
    assert.equal(parseCnNumber("十二"), 12);
    assert.equal(parseCnNumber("二十"), 20);
    assert.equal(parseCnNumber("一百零三"), 103);
    assert.equal(parseCnNumber("两千"), 2000);
    assert.equal(parseCnNumber("一万零三"), 10003);
    assert.equal(parseCnNumber("37"), 37);
    assert.equal(parseCnNumber("第"), null);
});

test("extractChapterNumber reads the number from headings", () => {
    assert.equal(extractChapterNumber("第一章 初入山门"), 1);
    assert.equal(extractChapterNumber("第十二章"), 12);
    assert.equal(extractChapterNumber("Chapter 7 - Return"), 7);
    assert.equal(extractChapterNumber("序章"), null);
});

test("detectChapters keeps the novel's own numbering, not a sequential counter", () => {
    const text = [
        "第五章 重逢",
        "正文甲。",
        "第六章 别离",
        "正文乙。",
    ].join("\n");

    const chapters = detectChapters(text);
    assert.equal(chapters.length, 2);
    assert.equal(chapters[0].chapterIndex, 5);
    assert.equal(chapters[1].chapterIndex, 6);
    assert.equal(chapters[0].title, "第五章 重逢");
});

test("detectChapters returns empty when there is no heading", () => {
    assert.deepEqual(detectChapters("只是一段普通文本。\n没有章节标题。"), []);
});

test("chunkDocument does not split across chapters and keeps order", () => {
    const body = (sentence, times) => sentence.repeat(times);
    const novel = [
        "第一章 初入山门",
        "",
        body("少年背着行囊站在山门前。", 40),
        "",
        "第二章 拜师",
        "",
        body("山门内长老端坐堂上。", 40),
        "",
        "第三章 试炼",
        "",
        body("一年之后试炼开始。", 40),
    ].join("\n");

    const chunks = chunkDocument(novel, {
        mode: "semantic",
        minChars: 120,
        maxChars: 260,
    });

    assert.ok(chunks.length > 0);
    chunks.forEach((chunk, i) => {
        assert.equal(chunk.chunkIndex, i);
    });

    const chapterIndexes = [...new Set(chunks.map((c) => c.chapterIndex))];
    assert.deepEqual(chapterIndexes, [1, 2, 3]);

    const regexes = compileChapterRegexes();
    for (const chunk of chunks) {
        const headings = String(chunk.text)
            .split("\n")
            .filter((line) => findHeadingLine(line, regexes));
        assert.ok(
            headings.length <= 1,
            `chunk ${chunk.chunkIndex} 跨章: ${JSON.stringify(headings)}`,
        );
        const isLast = chunk.chunkIndex === chunks.length - 1;
        assert.ok(
            chunk.text.length <= 260 || isLast,
            `chunk ${chunk.chunkIndex} 超长: ${chunk.text.length}`,
        );
    }

    assert.ok(novel.includes(chunks[0].text.split("\n")[0]));
});

test("chunkDocument keeps every chapter heading inside its own chunk", () => {
    const chunks = chunkDocument(
        ["第一章 甲", "内容甲。", "第二章 乙", "内容乙。"].join("\n"),
        { mode: "semantic", minChars: 1, maxChars: 200 },
    );
    const texts = chunks.map((c) => c.text);
    assert.ok(texts.some((t) => t.includes("第一章 甲")));
    assert.ok(texts.some((t) => t.includes("第二章 乙")));
});

test("chunkDocument auto mode falls back to legacy chunking without headings", () => {
    const plain = "没有任何章节标记的文本。".repeat(60);
    const chunks = chunkDocument(plain, {
        mode: "auto",
        legacyChunkSize: 200,
    });
    assert.ok(chunks.length > 1);
    chunks.forEach((chunk) => {
        assert.equal(chunk.chapterIndex, null);
        assert.equal(chunk.chapterTitle, null);
    });
});

test("chunkDocument legacy mode honours the custom delimiter", () => {
    const chunks = chunkDocument("甲###乙###丙", {
        mode: "legacy",
        legacyDelimiter: "###",
    });
    assert.deepEqual(
        chunks.map((c) => c.text),
        ["甲", "乙", "丙"],
    );
});
