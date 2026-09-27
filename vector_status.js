function metaOf(entry) {
    if (!entry) return {};
    return entry.metadata && typeof entry.metadata === "object"
        ? entry.metadata
        : entry;
}

/**
 * 唯一键：doc_name + chunk_index。
 * 不能用 id：入库失败时 BM25 里的 id 是兜底值 `chunk_i_时间戳`，与向量库无法对应。
 */
function normalizeKey(docName, chunkIndex) {
    const doc = docName === undefined || docName === null ? "" : String(docName);
    const idx =
        chunkIndex === undefined || chunkIndex === null
            ? ""
            : String(chunkIndex);
    return `${doc}#${idx}`;
}

function asArray(input) {
    if (Array.isArray(input)) return input;
    if (input && typeof input === "object") return Object.values(input);
    return [];
}

/**
 * 对比 BM25（全部切片）与向量库（已向量化切片），找出缺失向量的切片。
 * @param {Array|object} bm25Docs  全部切片（数组或 storedFields 映射）
 * @param {Array} vectorItems      向量库条目（含 metadata.doc_name / chunk_index）
 */
function diffMissing(bm25Docs, vectorItems) {
    const present = new Set();
    for (const raw of asArray(vectorItems)) {
        const metadata = metaOf(raw);
        present.add(normalizeKey(metadata.doc_name, metadata.chunk_index));
    }

    const seen = new Set();
    const missing = [];
    let total = 0;
    let vectorized = 0;

    for (const raw of asArray(bm25Docs)) {
        const metadata = metaOf(raw);
        const key = normalizeKey(metadata.doc_name, metadata.chunk_index);
        if (seen.has(key)) continue;
        seen.add(key);
        total += 1;

        if (present.has(key)) {
            vectorized += 1;
            continue;
        }

        missing.push({
            doc_name: metadata.doc_name === undefined ? null : metadata.doc_name,
            chunk_index:
                metadata.chunk_index === undefined ? null : metadata.chunk_index,
            chapter_index:
                metadata.chapter_index === undefined
                    ? null
                    : metadata.chapter_index,
            chapter_title:
                metadata.chapter_title === undefined
                    ? null
                    : metadata.chapter_title,
            text: typeof metadata.text === "string" ? metadata.text : "",
        });
    }

    return { total, vectorized, missing };
}

module.exports = { diffMissing, normalizeKey };
