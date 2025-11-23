"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteTwin = exports.getTwinById = exports.getUserTwins = exports.createTwin = void 0;
const database_1 = require("../../config/database");
const twinService_1 = require("./twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const eventLogger_1 = require("../../services/eventLogger");
const safety_1 = require("../../utils/safety");
const featureFlags_1 = require("../../config/featureFlags");
const errors_1 = require("../../utils/errors");
const idGenerator_1 = require("../../utils/idGenerator");
const twinService = new twinService_1.TwinService();
const createTwinSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(1, 'At least 1 sample required').max(5, 'Maximum 5 samples allowed'),
});
const testSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string())
});
const createTwin = async (req, res, next) => {
    try {
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const { samples } = createTwinSchema.parse(req.body);
        const existingTwinQuery = `
    SELECT id, "createdAt" 
    FROM "Twin" 
    WHERE "userId" = $1 
    LIMIT 1
    `;
        const existingTwinResult = await database_1.db.query(existingTwinQuery, [req.user.id]);
        if (existingTwinResult.rows.length > 0) {
            const existingTwin = existingTwinResult.rows[0];
            throw errors_1.createError.conflict('User already has a twin. Only one twin per user is allowed.', {
                existingTwin: {
                    id: existingTwin.id,
                    createdAt: existingTwin.createdAt
                }
            });
        }
        if (!featureFlags_1.featureFlags.ENABLE_AI_GENERATION) {
            throw errors_1.createError.internal('AI generation is currently disabled');
        }
        const validation = (0, safety_1.validateTwinSamples)(samples);
        console.log('Samples received for validation:', samples);
        console.log('Validation result:', validation);
        if (!validation.valid) {
            throw errors_1.createError.validation('Invalid samples', validation.errors);
        }
        const combinedText = samples.join(' ');
        const safetyCheck = (0, safety_1.isContentSafe)(combinedText);
        console.log('Safety check result:', safetyCheck);
        if (!safetyCheck.safe) {
            throw errors_1.createError.validation('Content safety check failed', { reasons: safetyCheck.reasons });
        }
        const sanitizedSamples = samples.map(sample => (0, safety_1.sanitizeText)(sample));
        const styleVector = await twinService.extractStyle(sanitizedSamples.join('\n---\n'));
        const sampleReply = await twinService.generateSampleReply(styleVector);
        const twinId = idGenerator_1.generateId.twin();
        const insertQuery = `
    INSERT INTO "Twin" (id, "userId", "styleVector", "sampleReply", "isPublic", "verified", "likeCount", "followCount", "chatCount", "createdAt")
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id, "createdAt"
   `;
        const result = await database_1.db.query(insertQuery, [
            twinId,
            req.user.id,
            JSON.stringify(styleVector),
            sampleReply,
            false,
            false,
            0,
            0,
            0,
            new Date()
        ]);
        const twin = {
            id: twinId,
            userId: req.user.id,
            styleVector,
            sampleReply,
            createdAt: result.rows[0].createdAt
        };
        await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_created', {
            twinId: twin.id,
            samplesCount: samples.length,
            totalLength: combinedText.length,
            styleVector: styleVector
        });
        res.json({
            success: true,
            twin: {
                id: twin.id,
                styleVector,
                sampleReply,
                createdAt: twin.createdAt,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Twin creation error:', error);
        if (req.user) {
            await eventLogger_1.EventLogger.logUserEvent(req.user.id, 'twin_creation_failed', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ error: 'Invalid input', details: error.errors });
        }
        if (error instanceof Error && 'statusCode' in error) {
            const appError = error;
            return res.status(appError.statusCode || 500).json({
                error: appError.message || 'Failed to create twin'
            });
        }
        return res.status(500).json({ error: 'Failed to create twin' });
    }
};
exports.createTwin = createTwin;
const getUserTwins = async (req, res, next) => {
    try {
        logger_1.logger.debug('Getting user twins:', { userId: req.user?.id });
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const twins = await database_1.db.query(`
      SELECT id, "styleVector", "sampleReply", "createdAt"
      FROM "Twin"
      WHERE "userId" = $1
      ORDER BY "createdAt" DESC
    `, [req.user.id]);
        logger_1.logger.debug('Found twins:', { count: twins.rows.length });
        res.json({ twins: twins.rows });
    }
    catch (error) {
        next(error);
    }
};
exports.getUserTwins = getUserTwins;
const getTwinById = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
        const twinResult = await database_1.db.query(`
      SELECT * FROM "Twin"
      WHERE id = $1 AND "userId" = $2
    `, [id, req.user.id]);
        const twin = twinResult.rows[0];
        if (!twin) {
            throw errors_1.createError.notFound('Twin not found', errors_1.ErrorCodes.TWIN_NOT_FOUND);
        }
        res.json({ twin });
    }
    catch (error) {
        next(error);
    }
};
exports.getTwinById = getTwinById;
const deleteTwin = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const twin = await database_1.twinQueries.findById(twinId);
        if (!twin) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        if (twin.userId !== userId) {
            return res.status(403).json({ error: 'You do not have permission to delete this twin' });
        }
        await database_1.twinQueries.delete(twinId, userId);
        logger_1.logger.info(`Twin ${twinId} deleted by user ${userId}`);
        res.json({
            success: true,
            message: 'Twin deleted successfully'
        });
    }
    catch (error) {
        logger_1.logger.error('Delete twin error:', error);
        if (error.message?.includes('not found') || error.message?.includes('not owned')) {
            return res.status(404).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to delete twin' });
    }
};
exports.deleteTwin = deleteTwin;
//# sourceMappingURL=twinController.js.map