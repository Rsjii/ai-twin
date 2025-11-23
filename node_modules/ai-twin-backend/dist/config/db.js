"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const env_1 = require("./env");
const constants_1 = require("./constants");
let connectionString = env_1.config.databaseUrl || '';
if (connectionString.includes('?')) {
    connectionString = `${connectionString}&timezone=UTC`;
}
else {
    connectionString = `${connectionString}?timezone=UTC`;
}
console.log('[DB] 🔧 Connection string configured with timezone=UTC');
console.log('[DB] 🔧 Connection string (masked):', connectionString.replace(/:[^:@]+@/, ':****@'));
const pool = new pg_1.Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false
    },
    ...constants_1.DB_POOL_CONFIG
});
pool.on('connect', async (client) => {
    try {
        const timezoneResult = await client.query("SHOW timezone");
        const currentTimezone = timezoneResult.rows[0]?.timezone || 'unknown';
        console.log('[DB] ✅ Connected to PostgreSQL database');
        console.log('[DB] ✅ PostgreSQL timezone setting:', currentTimezone);
        if (currentTimezone.toLowerCase() !== 'utc') {
            console.warn('[DB] ⚠️ WARNING: PostgreSQL timezone is not UTC! Setting to UTC...');
            await client.query("SET timezone = 'UTC'");
            const verifyResult = await client.query("SHOW timezone");
            console.log('[DB] ✅ PostgreSQL timezone now set to:', verifyResult.rows[0]?.timezone);
        }
    }
    catch (err) {
        console.error('[DB] ❌ Error setting/verifying timezone:', err);
    }
});
pool.on('error', (err) => {
    console.error('Database connection error:', err);
});
exports.db = {
    query: async (text, params) => {
        const start = Date.now();
        let attempts = 0;
        const maxAttempts = constants_1.DB_RETRY.MAX_ATTEMPTS;
        while (attempts < maxAttempts) {
            try {
                const res = await pool.query(text, params);
                const duration = Date.now() - start;
                console.log('[DB] ✅ Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
                return res;
            }
            catch (error) {
                attempts++;
                console.error(`[DB] ❌ Database query error (attempt ${attempts}):`, error.message);
                if (attempts >= maxAttempts) {
                    console.error('[DB] ❌ Database query failed after all retries:', error);
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, constants_1.DB_RETRY.BASE_DELAY_MS * attempts));
            }
        }
        throw new Error('Database query failed after all retries');
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