const test = require("node:test");
const assert = require("node:assert/strict");

const { diffMissing, normalizeKey } = require("../vector_status");

test("normalizeKey is built from doc_name and chunk_index", () => {
    assert.equal(normalizeKey("novel.txt", 3), "novel.txt#3");
    assert.equal(normalizeKey(null, undefined), "#");
});

test("diffMissing matches on doc_name + chunk_index, not on id", () => {
    const bm25Docs = [
        { id: "chunk_0_111", doc_name: "novel.txt", chunk_index: 0, text: "甲" },
        { id: "chunk_1_222", doc_name: "novel.txt", chunk_index: 1, text: "乙" },
        { id: "chunk_2_333", doc_name: "novel.txt", chunk_index: 2, text: "丙" },
    ];
    const vectorItems = [
        { id: "uuid-a", metadata: { doc_name: "novel.txt", chunk_index: 0 } },
        { id: "uuid-b", metadata: { doc_name: "novel.txt", chunk_index: 2 } },
    ];

    const result = diffMissing(bm25Docs, vectorItems);
    assert.equal(result.total, 3);
    assert.equal(result.vectorized, 2);
    assert.deepEqual(
        result.missing.map((m) => m.chunk_index),
        [1],
    );
    assert.equal(result.missing[0].text, "乙");
});

test("diffMissing deduplicates repeated chunks and tolerates storedFields maps", () => {
    const storedFields = {
        a: { doc_name: "n.txt", chunk_index: 0, text: "甲" },
        b: { doc_name: "n.txt", chunk_index: 0, text: "甲" },
        c: { doc_name: "n.txt", chunk_index: 1, text: "乙" },
    };

    const result = diffMissing(storedFields, []);
    assert.equal(result.total, 2);
    assert.equal(result.vectorized, 0);
    assert.equal(result.missing.length, 2);
});

test("diffMissing separates docs that share a chunk_index", () => {
    const bm25Docs = [
        { doc_name: "a.txt", chunk_index: 0, text: "甲" },
        { doc_name: "b.txt", chunk_index: 0, text: "乙" },
    ];
    const vectorItems = [
        { metadata: { doc_name: "a.txt", chunk_index: 0 } },
    ];

    const result = diffMissing(bm25Docs, vectorItems);
    assert.equal(result.total, 2);
    assert.equal(result.vectorized, 1);
    assert.deepEqual(
        result.missing.map((m) => m.doc_name),
        ["b.txt"],
    );
});

test("diffMissing carries chapter metadata through for backfill", () => {
    const result = diffMissing(
        [
            {
                doc_name: "novel.txt",
                chunk_index: 4,
                chapter_index: 2,
                chapter_title: "第二章",
                text: "正文",
            },
        ],
        [],
    );
    assert.equal(result.missing[0].chapter_index, 2);
    assert.equal(result.missing[0].chapter_title, "第二章");
});
