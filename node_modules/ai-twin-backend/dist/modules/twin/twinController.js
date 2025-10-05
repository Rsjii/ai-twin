"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTwinById = exports.getUserTwins = exports.createTwin = void 0;
const prisma_1 = require("../../config/prisma");
const twinService_1 = require("./twinService");
const logger_1 = require("../../config/logger");
const zod_1 = require("zod");
const twinService = new twinService_1.TwinService();
const createTwinSchema = zod_1.z.object({
    samples: zod_1.z.string().min(100, 'At least 100 characters required').max(3000, 'Maximum 3000 characters allowed'),
});
const createTwin = async (req, res) => {
    try {
        const { samples } = createTwinSchema.parse(req.body);
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const styleVector = await twinService.extractStyle(samples);
        const sampleReply = await twinService.generateSampleReply(styleVector);
        const twin = await prisma_1.prisma.twin.create({
            data: {
                userId: req.user.id,
                styleVector: styleVector,
                sampleReply,
            },
        });
        await prisma_1.prisma.event.create({
            data: {
                userId: req.user.id,
                type: 'twin_created',
                meta: { twinId: twin.id },
            },
        });
        res.json({
            success: true,
            twin: {
                id: twin.id,
                styleVector,
                sampleReply,
            },
        });
    }
    catch (error) {
        logger_1.logger.error('Twin creation error:', error);
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