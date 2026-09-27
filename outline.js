const { compileChapterRegexes, extractChapterNumber, findHeadingLine } = require("./chunking");

function metaOf(entry) {
    if (!entry) return {};
    return entry.metadata && typeof entry.metadata === "object"
        ? entry.metadata
        : entry;
}

function toNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function toNonNegative(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function docKey(metadata) {
    const doc = metadata.doc_name;
    return doc === undefined || doc === null || doc === "" ? "__default__" : String(doc);
}

/**
 * 由向量库条目构建大纲：按 doc 分组、按 chunk_index 排序；
 * 缺 chapter_index 时按顺序扫描文本里的章标题推导，让旧库无需重建即可用闸门。
 */
function buildOutline(items, options = {}) {
    const regexes = compileChapterRegexes(options.chapterPatterns);
    const byDoc = new Map();

    for (const raw of items || []) {
        const metadata = { ...metaOf(raw) };
        const key = docKey(metadata);
        if (!byDoc.has(key)) byDoc.set(key, []);
        byDoc.get(key).push({ id: raw.id, metadata });
    }

    const ordered = [];
    for (const list of byDoc.values()) {
        list.sort(
            (a, b) =>
                toNumber(a.metadata.chunk_index, 0) -
                toNumber(b.metadata.chunk_index, 0),
        );

        const needsDerive = list.some(
            (it) =>
                it.metadata.chapter_index === undefined ||
                it.metadata.chapter_index === null,
        );

        if (needsDerive && regexes.length > 0) {
            let derived = null;
            let derivedTitle = null;
            for (const it of list) {
                const heading = findHeadingLine(it.metadata.text, regexes);
                if (heading) {
                    const parsed = extractChapterNumber(heading);
                    derived =
                        parsed !== null && parsed > 0
                            ? parsed
                            : derived === null
                              ? 1
                              : derived + 1;
                    derivedTitle = heading;
                }
                if (
                    it.metadata.chapter_index === undefined ||
                    it.metadata.chapter_index === null
                ) {
                    it.metadata.chapter_index = derived;
                    if (it.metadata.chapter_title === undefined) {
                        it.metadata.chapter_title = derivedTitle;
                    }
                }
            }
        }

        for (const it of list) ordered.push(it);
    }

    return { byDoc, ordered };
}

function indexOfChunk(list, metadata, id) {
    for (let i = 0; i < list.length; i++) {
        if (id !== undefined && list[i].id === id) return i;
        if (
            String(list[i].metadata.chunk_index) ===
            String(metadata.chunk_index)
        ) {
            return i;
        }
    }
    return -1;
}

/**
 * 邻接前后文扩展：命中片向两侧扩 [pos-back, pos+forward]，按原著顺序输出。
 * chapterCap 非空时丢弃 / 不扩展到章节号大于它的切片。
 */
function expandNeighbors(hits, outline, options = {}) {
    const back = toNonNegative(options.back, 1);
    const forward = toNonNegative(options.forward, 1);
    const chapterCap =
        options.chapterCap === undefined || options.chapterCap === null
            ? null
            : Number(options.chapterCap);
    const list = Array.isArray(hits) ? hits : [];
    if (!outline || !outline.byDoc) return list.slice();

    const picked = new Map();

    for (const hit of list) {
        const item = (hit && hit.item) || hit;
        const metadata = metaOf(item);
        const key = docKey(metadata);
        const docList = outline.byDoc.get(key);

        if (!docList) {
            const own = `${key}#${metadata.chunk_index}`;
            if (!picked.has(own)) {
                picked.set(own, hit);
            }
            continue;
        }

        const pos = indexOfChunk(docList, metadata, item && item.id);
        if (pos === -1) {
            const own = `${key}#${metadata.chunk_index}`;
            if (!picked.has(own)) picked.set(own, hit);
            continue;
        }

        const from = Math.max(0, pos - back);
        const to = Math.min(docList.length - 1, pos + forward);

        for (let i = from; i <= to; i++) {
            const entry = docList[i];
            if (chapterCap !== null) {
                const ci = entry.metadata.chapter_index;
                if (ci !== undefined && ci !== null && Number(ci) > chapterCap) {
                    continue;
                }
            }
            const entryKey = `${key}#${entry.metadata.chunk_index}`;
            if (picked.has(entryKey)) continue;
            const isOriginal =
                String(entry.metadata.chunk_index) ===
                    String(metadata.chunk_index) &&
                (item && item.id !== undefined ? entry.id === item.id : true);
            picked.set(entryKey, {
                item: { id: entry.id, metadata: entry.metadata },
                score: hit && hit.score !== undefined ? hit.score : 0,
                _source_collection:
                    hit && hit._source_collection !== undefined
                        ? hit._source_collection
                        : undefined,
                _is_neighbor: !isOriginal,
            });
        }
    }

    const results = Array.from(picked.values());
    results.sort((a, b) => {
        const am = metaOf(a.item);
        const bm = metaOf(b.item);
        const ad = docKey(am);
        const bd = docKey(bm);
        if (ad !== bd) return ad.localeCompare(bd);
        const ac = toNumber(am.chapter_index, 0);
        const bc = toNumber(bm.chapter_index, 0);
        if (ac !== bc) return ac - bc;
        return toNumber(am.chunk_index, 0) - toNumber(bm.chunk_index, 0);
    });
    return results;
}

/**
 * 大纲缓存。TTL 由调用方按 key 传入，便于运行期改配置。
 */
function createOutlineCache() {
    const store = new Map();
    return {
        get(key, ttlMs) {
            const entry = store.get(key);
            if (!entry) return null;
            if (Date.now() - entry.builtAt >= ttlMs) return null;
            return entry.outline;
        },
        set(key, outline) {
            store.set(key, { builtAt: Date.now(), outline });
        },
        invalidate(key) {
            store.delete(key);
        },
        clear() {
            store.clear();
        },
    };
}

module.exports = {
    buildOutline,
    createOutlineCache,
    expandNeighbors,
};
