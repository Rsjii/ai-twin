"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fastQuery = void 0;
const database_1 = require("../config/database");
const logger_1 = require("../config/logger");
const fastQuery = async (queryText, params) => {
    try {
        const client = await database_1.db.getClient();
        try {
            const result = await client.query(queryText, params || []);
            return result || { rows: [] };
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        if (error?.code === '42P01' || error?.code === '42703') {
            return { rows: [] };
        }
        logger_1.logger.error('Fast query error:', error?.message);
        return { rows: [] };
    }
};
exports.fastQuery = fastQuery;
//# sourceMappingURL=dbUtils.js.map