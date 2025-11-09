"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinById = exports.getUserTwins = exports.createTwin = void 0;
const database_1 = require("../../config/database");
const twinService_1 = require("./twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const eventLogger_1 = require("../../services/eventLogger");
const safety_1 = require("../../utils/safety");
const featureFlags_1 = require("../../config/featureFlags");
const errors_1 = require("../../utils/errors");
const twinService = new twinService_1.TwinService();
const createTwinSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(1, 'At least 1 sample required').max(5, 'Maximum 5 samples allowed'),
});
const testSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string())
});
const createTwin = async (req, res, next) => {
    try {
        console.log('=== MIDDLEWARE CHECK ===');
        console.log('req.user before any checks:', req.user);
        console.log('req.cookies:', req.cookies);
        console.log('========================');
        console.log('=== DEBUGGING TWIN CREATION ===');
        console.log('Parsed request body:', JSON.stringify(req.body, null, 2));
        console.log('Request body type:', typeof req.body);
        console.log('Request body samples:', req.body.samples);
        console.log('Request body samples type:', typeof req.body.samples);
        console.log('Request body samples isArray:', Array.isArray(req.body.samples));
        console.log('Request body samples constructor:', req.body.samples?.constructor?.name);
        try {
            const { samples } = testSchema.parse(req.body);
            console.log('Simple schema parsing successful, samples:', samples);
        }
        catch (error) {
            console.log('Simple schema parsing failed:', error);
        }
        try {
            const { samples } = createTwinSchema.parse(req.body);
            console.log('Full schema parsing successful, samples:', samples);
        }
        catch (error) {
            console.log('Full schema parsing failed:', error);
            throw error;
        }
        const { samples } = createTwinSchema.parse(req.body);
        console.log('=== AUTHENTICATION DEBUG ===');
        console.log('req.user:', req.user);
        console.log('req.user type:', typeof req.user);
        console.log('req.user keys:', req.user ? Object.keys(req.user) : 'undefined');
        console.log('============================');
        if (!req.user) {
            throw errors_1.createError.unauthorized();
        }
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
        const twinId = `twin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
            id: 'test-twin-id',
            userId: req.user.id,
            styleVector,
            sampleReply,
            createdAt: new Date()
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to create twin', error);
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get user twins', error);
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
        if (error instanceof errors_1.AppError) {
            throw error;
        }
        throw errors_1.createError.internal('Failed to get twin', error);
    }
};
exports.getTwinById = getTwinById;
//# sourceMappingURL=twinController.js.map