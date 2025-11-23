"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTwinOwnership = verifyTwinOwnership;
const database_1 = require("../config/database");
const errors_1 = require("./errors");
async function verifyTwinOwnership(twinId, userId) {
    const twin = await database_1.db.query('SELECT id FROM "Twin" WHERE id = $1 AND "userId" = $2', [twinId, userId]);
    if (!twin || twin.rows.length === 0) {
        throw errors_1.createError.notFound('Twin not found or access denied', errors_1.ErrorCodes.TWIN_NOT_FOUND);
    }
}
//# sourceMappingURL=twinUtils.js.map