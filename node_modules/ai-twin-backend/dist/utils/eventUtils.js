"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.extractEventTags = extractEventTags;
exports.formatEventMeta = formatEventMeta;
function extractEventTags(meta) {
    if (!meta || typeof meta !== 'object')
        return [];
    const tags = [];
    if (meta.wv)
        tags.push(`wv:${meta.wv}`);
    if (meta.source)
        tags.push(`source:${meta.source}`);
    if (meta.twinId)
        tags.push(`twin:${meta.twinId.substring(0, 8)}`);
    if (meta.chatId)
        tags.push(`chat:${meta.chatId.substring(0, 8)}`);
    if (meta.landingPage)
        tags.push(`page:${meta.landingPage}`);
    return tags;
}
function formatEventMeta(meta, maxLength = 100) {
    if (!meta || typeof meta !== 'object')
        return '';
    const relevantKeys = ['wv', 'source', 'twinId', 'chatId', 'landingPage'];
    const filtered = {};
    relevantKeys.forEach(key => {
        if (meta[key])
            filtered[key] = meta[key];
    });
    const jsonStr = JSON.stringify(filtered);
    if (jsonStr.length <= maxLength)
        return jsonStr;
    return jsonStr.substring(0, maxLength - 3) + '...';
}
//# sourceMappingURL=eventUtils.js.map