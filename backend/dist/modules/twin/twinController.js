"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinById = exports.getUserTwins = exports.createTwin = void 0;
const prisma_1 = require("../../config/prisma");
const twinService_1 = require("./twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const eventLogger_1 = require("../../services/eventLogger");
const safety_1 = require("../../utils/safety");
const featureFlags_1 = require("../../config/featureFlags");
const twinService = new twinService_1.TwinService();
const createTwinSchema = zod_1.z.object({
    samples: zod_1.z.array(zod_1.z.string().min(10, 'Each sample must be at least 10 characters').max(1000, 'Each sample must not exceed 1000 characters')).min(3, 'At least 3 samples required').max(5, 'Maximum 5 samples allowed'),
});
const createTwin = async (req, res) => {
    try {
        console.log('CreateTwin called. User:', req.user);
        console.log('Request body:', req.body);
        console.log('Request body type:', typeof req.body);
        console.log('Request body keys:', Object.keys(req.body));
        console.log('Samples field:', req.body.samples);
        console.log('Samples type:', typeof req.body.samples);
        const { samples } = createTwinSchema.parse(req.body);
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!featureFlags_1.featureFlags.ENABLE_AI_GENERATION) {
            return res.status(503).json({ error: 'AI generation is currently disabled' });
        }
        const validation = (0, safety_1.validateTwinSamples)(samples);
        if (!validation.valid) {
            return res.status(400).json({
                error: 'Invalid samples',
                details: validation.errors
            });
        }
        const combinedText = samples.join(' ');
        const safetyCheck = (0, safety_1.isContentSafe)(combinedText);
        if (!safetyCheck.safe) {
            return res.status(400).json({
                error: 'Content safety check failed',
                reasons: safetyCheck.reasons
            });
        }
        const sanitizedSamples = samples.map(sample => (0, safety_1.sanitizeText)(sample));
        console.log('Extracting style vector...');
        const styleVector = await twinService.extractStyle(sanitizedSamples.join('\n---\n'));
        console.log('Style vector extracted:', styleVector);
        console.log('Generating sample reply...');
        const sampleReply = await twinService.generateSampleReply(styleVector);
        console.log('Sample reply generated:', sampleReply);
        const twin = await prisma_1.prisma.twin.create({
            data: {
                userId: req.user.id,
                styleVector: styleVector,
                sampleReply,
            },
        });
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
        if (error instanceof Error) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.createTwin = createTwin;
const getUserTwins = async (req, res) => {
    try {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const twins = await prisma_1.prisma.twin.findMany({
            where: { userId: req.user.id },
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                styleVector: true,
                sampleReply: true,
                createdAt: true,
            },
        });
        res.json({ twins });
    }
    catch (error) {
        logger_1.logger.error('Get twins error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getUserTwins = getUserTwins;
const getTwinById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const twin = await prisma_1.prisma.twin.findFirst({
            where: {
                id,
                userId: req.user.id,
            },
        });
        if (!twin) {
            return res.status(404).json({ error: 'Twin not found' });
        }
        res.json({ twin });
    }
    catch (error) {
        logger_1.logger.error('Get twin error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.getTwinById = getTwinById;
//# sourceMappingURL=twinController.js.map