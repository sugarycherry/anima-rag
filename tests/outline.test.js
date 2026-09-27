const test = require("node:test");
const assert = require("node:assert/strict");

const { buildOutline, expandNeighbors, createOutlineCache } = require("../outline");

function item(id, doc, chunkIndex, text, extra = {}) {
    return {
        id,
        metadata: {
            doc_name: doc,
            chunk_index: chunkIndex,
            text,
            ...extra,
        },
    };
}

test("buildOutline groups by doc and sorts by chunk_index", () => {
    const outline = buildOutline([
        item("c", "novel.txt", 2, "丙"),
        item("a", "novel.txt", 0, "甲"),
        item("b", "novel.txt", 1, "乙"),
        item("d", "other.txt", 0, "丁"),
    ]);

    assert.deepEqual(
        outline.byDoc.get("novel.txt").map((i) => i.metadata.chunk_index),
        [0, 1, 2],
    );
    assert.deepEqual(
        outline.ordered.map((i) => i.id),
        ["a", "b", "c", "d"],
    );
});

test("buildOutline derives chapter_index for legacy items from headings", () => {
    const outline = buildOutline([
        item("a", "n.txt", 0, "第一章 起点\n正文甲"),
        item("b", "n.txt", 1, "正文乙"),
        item("c", "n.txt", 2, "第三章 转折\n正文丙"),
    ]);

    const list = outline.byDoc.get("n.txt");
    assert.equal(list[0].metadata.chapter_index, 1);
    assert.equal(list[1].metadata.chapter_index, 1);
    assert.equal(list[2].metadata.chapter_index, 3);
    assert.equal(list[2].metadata.chapter_title, "第三章 转折");
});

test("expandNeighbors pulls surrounding slices and returns original order", () => {
    const outline = buildOutline([
        item("a", "n.txt", 0, "第一章\n甲"),
        item("b", "n.txt", 1, "乙"),
        item("c", "n.txt", 2, "丙"),
        item("d", "n.txt", 3, "丁"),
    ]);

    const hits = [
        {
            item: item("c", "n.txt", 2, "丙"),
            score: 0.9,
            _source_collection: "kb_n",
        },
    ];

    const expanded = expandNeighbors(hits, outline, { back: 1, forward: 1 });
    assert.deepEqual(
        expanded.map((r) => r.item.id),
        ["b", "c", "d"],
    );
    assert.equal(expanded[1]._is_neighbor, false);
    assert.equal(expanded[0]._is_neighbor, true);
    assert.equal(expanded[0].score, 0.9);
});

test("expandNeighbors respects chapterCap and never leaks future chapters", () => {
    const outline = buildOutline([
        item("a", "n.txt", 0, "第一章\n甲"),
        item("b", "n.txt", 1, "乙"),
        item("c", "n.txt", 2, "第五章\n丙"),
        item("d", "n.txt", 3, "第六节\n丁"),
    ]);

    const hits = [
        {
            item: item("b", "n.txt", 1, "乙", { chapter_index: 1 }),
            score: 0.8,
            _source_collection: "kb_n",
        },
    ];

    const expanded = expandNeighbors(hits, outline, {
        back: 1,
        forward: 2,
        chapterCap: 1,
    });
    assert.deepEqual(
        expanded.map((r) => r.item.id),
        ["a", "b"],
    );
});

test("expandNeighbors keeps unknown-doc hits untouched", () => {
    const outline = buildOutline([item("a", "n.txt", 0, "甲")]);
    const hits = [{ item: item("z", "ghost.txt", 9, "幽灵"), score: 0.5 }];
    const expanded = expandNeighbors(hits, outline, { back: 1, forward: 1 });
    assert.equal(expanded.length, 1);
    assert.equal(expanded[0].item.id, "z");
});

test("outline cache honours ttl and invalidate", () => {
    const cache = createOutlineCache();
    const outline = { byDoc: new Map(), ordered: [] };
    cache.set("k", outline);

    assert.equal(cache.get("k", 10000), outline);
    assert.equal(cache.get("k", 0), null);
    assert.equal(cache.get("k", 10000), outline);

    cache.invalidate("k");
    assert.equal(cache.get("k", 10000), null);
});
