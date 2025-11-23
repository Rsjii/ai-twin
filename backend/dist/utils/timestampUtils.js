"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeTimestamp = normalizeTimestamp;
exports.normalizeTimestampsInObject = normalizeTimestampsInObject;
exports.formatRelativeTime = formatRelativeTime;
function normalizeTimestamp(timestamp) {
    if (!timestamp)
        return null;
    try {
        if (timestamp instanceof Date) {
            return timestamp.toISOString();
        }
        if (typeof timestamp === 'string') {
            const ts = timestamp.trim();
            if (ts.endsWith('Z')) {
                return ts;
            }
            if (ts.match(/[+-]\d{2}:\d{2}$/)) {
                const date = new Date(ts);
                return date.toISOString();
            }
            if (ts.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/)) {
                return ts + 'Z';
            }
            if (ts.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/)) {
                return ts.replace(' ', 'T') + 'Z';
            }
            if (ts.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/)) {
                const parts = ts.split('.');
                if (parts[1] && parts[1].length > 3) {
                    return parts[0].replace(' ', 'T') + '.' + parts[1].substring(0, 3) + 'Z';
                }
                else {
                    return ts.replace(' ', 'T') + 'Z';
                }
            }
            const date = new Date(ts);
            if (!isNaN(date.getTime())) {
                return date.toISOString();
            }
            return ts;
        }
        return null;
    }
    catch (error) {
        console.error('[normalizeTimestamp] Error normalizing timestamp:', timestamp, error);
        return null;
    }
}
function normalizeTimestampsInObject(obj, timestampFields = ['createdAt', 'updatedAt', 'lastActivity', 'timestamp', 'created_at', 'updated_at', 'last_activity']) {
    if (!obj)
        return obj;
    if (Array.isArray(obj)) {
        return obj.map(item => normalizeTimestampsInObject(item, timestampFields));
    }
    if (typeof obj === 'object') {
        const normalized = { ...obj };
        for (const key in normalized) {
            if (timestampFields.includes(key)) {
                normalized[key] = normalizeTimestamp(normalized[key]);
            }
            else if (typeof normalized[key] === 'object' && normalized[key] !== null) {
                normalized[key] = normalizeTimestampsInObject(normalized[key], timestampFields);
            }
        }
        return normalized;
    }
    return obj;
}
function formatRelativeTime(timestamp) {
    if (!timestamp)
        return '';
    try {
        const nowUTC = Date.now();
        let messageDate;
        if (timestamp instanceof Date) {
            messageDate = timestamp;
        }
        else if (typeof timestamp === 'string') {
            messageDate = new Date(timestamp);
        }
        else {
            return '';
        }
        if (isNaN(messageDate.getTime())) {
            return '';
        }
        const messageUTC = messageDate.getTime();
        const diff = nowUTC - messageUTC;
        if (diff < 0) {
            return 'Just now';
        }
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const weeks = Math.floor(days / 7);
        const months = Math.floor(days / 30);
        const years = Math.floor(days / 365);
        if (seconds < 60)
            return 'Just now';
        if (minutes < 60)
            return `${minutes}m ago`;
        if (hours < 24)
            return `${hours}h ago`;
        if (days < 7)
            return `${days}d ago`;
        if (weeks < 4)
            return `${weeks}w ago`;
        if (months < 12)
            return `${months}mo ago`;
        return `${years}y ago`;
    }
    catch (error) {
        console.error('[formatRelativeTime] Error formatting relative time:', timestamp, error);
        return '';
    }
}
//# sourceMappingURL=timestampUtils.js.map