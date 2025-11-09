"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const env_1 = require("./env");
const pool = new pg_1.Pool({
    connectionString: env_1.config.databaseUrl,
    ssl: {
        rejectUnauthorized: false
    },
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    acquireTimeoutMillis: 10000,
    createTimeoutMillis: 10000,
    retryDelayMs: 1000,
    retryAttempts: 3,
});
pool.on('connect', () => {
    console.log('Connected to PostgreSQL database');
});
pool.on('error', (err) => {
    console.error('Database connection error:', err);
});
exports.db = {
    query: async (text, params) => {
        const start = Date.now();
        let attempts = 0;
        const maxAttempts = 3;
        while (attempts < maxAttempts) {
            try {
                const res = await pool.query(text, params);
                const duration = Date.now() - start;
                console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
                return res;
            }
            catch (error) {
                attempts++;
                console.error(`Database query error (attempt ${attempts}):`, error.message);
                if (attempts >= maxAttempts) {
                    console.error('Database query failed after all retries:', error);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
            }
        }
    },
    getClient: async () => {
        return await pool.connect();
    },
    close: async () => {
        await pool.end();
    }
};
exports.default = exports.db;
//# sourceMappingURL=db.js.map