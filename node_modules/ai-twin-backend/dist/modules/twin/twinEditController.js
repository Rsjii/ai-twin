"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewStyleChanges = exports.updateTwinPersona = exports.updateTwinStyle = exports.getTwinEditData = void 0;
const zod_1 = require("zod");
const database_1 = require("../../config/database");
const logger_1 = require("../../config/logger");
const twinService_1 = require("./twinService");
const twinService = new twinService_1.TwinService();
const updateStyleSchema = zod_1.z.object({
    formality_level: zod_1.z.number().min(0).max(1).optional(),
    emoji_usage: zod_1.z.number().min(0).max(1).optional(),
    humor_style: zod_1.z.enum(['none', 'light', 'moderate', 'heavy']).optional(),
    question_frequency: zod_1.z.number().min(0).max(1).optional(),
    response_length_preference: zod_1.z.enum(['brief', 'detailed', 'comprehensive']).optional(),
    tone: zod_1.z.enum(['casual', 'witty', 'serious', 'friendly', 'professional']).optional(),
    sentence_length: zod_1.z.enum(['short', 'medium', 'long']).optional()
});
const updatePersonaSchema = zod_1.z.object({
    basicInfo: zod_1.z.object({
        fullName: zod_1.z.string().optional(),
        bio: zod_1.z.string().optional(),
        username: zod_1.z.string().optional(),
        primaryUseCase: zod_1.z.string().optional()
    }).optional(),
    communicationStyle: zod_1.z.object({
        tone: zod_1.z.object({
            formalCasual: zod_1.z.number().min(0).max(100).optional(),
            seriousPlayful: zod_1.z.number().min(0).max(100).optional(),
            directDiplomatic: zod_1.z.number().min(0).max(100).optional()
        }).optional(),
        language: zod_1.z.object({
            greetingStyle: zod_1.z.string().optional(),
            closingStyle: zod_1.z.string().optional(),
            emojiUsage: zod_1.z.string().optional(),
            responseLength: zod_1.z.string().optional(),
            commonPhrases: zod_1.z.string().optional()
        }).optional()
    }).optional(),
    context: zod_1.z.object({
        interests: zod_1.z.array(zod_1.z.string()).optional(),
        targetAudience: zod_1.z.string().optional(),
        topicsToAvoid: zod_1.z.string().optional()
    }).optional(),
    personality: zod_1.z.object({
        ocean: zod_1.z.record(zod_1.z.number()).optional(),
        communicationStyle: zod_1.z.record(zod_1.z.number()).optional()
    }).optional()
});
const getTwinEditData = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector", "personaData", "systemPrompt", "sampleReply", "createdAt", "last_updated", "style_version"
      FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or access denied' });
        }
        const twin = twinResult.rows[0];
        res.json({
            success: true,
            twin: {
                id: twin.id,
                styleVector: twin.styleVector,
                personaData: twin.personaData,
                sampleReply: twin.sampleReply,
                createdAt: twin.createdAt,
                lastUpdated: twin.last_updated,
                styleVersion: twin.style_version
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Get twin edit data error:', error);
        res.status(500).json({ error: 'Failed to get twin edit data' });
    }
};
exports.getTwinEditData = getTwinEditData;
const updateTwinStyle = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        const styleUpdates = updateStyleSchema.parse(req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or access denied' });
        }
        const currentStyleVector = twinResult.rows[0].styleVector;
        const updatedStyleVector = {
            ...currentStyleVector,
            ...styleUpdates
        };
        const newSystemPrompt = await twinService.generateSystemPrompt(updatedStyleVector, twinResult.rows[0].personaData);
        const utcTimestamp = new Date().toISOString();
        await database_1.db.query(`
      UPDATE "Twin" 
      SET "styleVector" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz, "style_version" = "style_version" + 1
      WHERE id = $4
    `, [JSON.stringify(updatedStyleVector), newSystemPrompt, utcTimestamp, twinId]);
        const newSampleReply = await twinService.generateSampleReply(updatedStyleVector);
        res.json({
            success: true,
            message: 'Twin style updated successfully',
            updatedStyleVector,
            newSampleReply,
            systemPrompt: newSystemPrompt
        });
    }
    catch (error) {
        logger_1.logger.error('Update twin style error:', error);
        res.status(500).json({ error: 'Failed to update twin style' });
    }
};
exports.updateTwinStyle = updateTwinStyle;
const updateTwinPersona = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        const personaUpdates = updatePersonaSchema.parse(req.body.personaData || req.body);
        const twinResult = await database_1.db.query(`
      SELECT id, "personaData", "styleVector" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({ error: 'Twin not found or access denied' });
        }
        const currentPersonaData = twinResult.rows[0].personaData;
        const updatedPersonaData = {
            ...currentPersonaData,
            ...personaUpdates
        };
        const newSystemPrompt = await twinService.generateSystemPrompt(twinResult.rows[0].styleVector, updatedPersonaData);
        const utcTimestamp = new Date().toISOString();
        await database_1.db.query(`
      UPDATE "Twin" 
      SET "personaData" = $1, "systemPrompt" = $2, "last_updated" = $3::timestamptz
      WHERE id = $4
    `, [JSON.stringify(updatedPersonaData), newSystemPrompt, utcTimestamp, twinId]);
        res.json({
            success: true,
            message: 'Twin persona updated successfully',
            updatedPersonaData,
            systemPrompt: newSystemPrompt
        });
    }
    catch (error) {
        logger_1.logger.error('Update twin persona error:', error);
        res.status(500).json({ error: 'Failed to update twin persona' });
    }
};
exports.updateTwinPersona = updateTwinPersona;
const previewStyleChanges = async (req, res) => {
    try {
        const { id: twinId } = req.params;
        const userId = req.user.id;
        const { styleChanges, testMessage } = req.body;
        if (!testMessage) {
            return res.status(400).json({
                success: false,
                error: 'Test message is required'
            });
        }
        const twinResult = await database_1.db.query(`
      SELECT id, "styleVector", "personaData" FROM "Twin" 
      WHERE id = $1 AND "userId" = $2
    `, [twinId, userId]);
        if (twinResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Twin not found or access denied'
            });
        }
        const currentStyleVector = twinResult.rows[0].styleVector;
        const personaData = twinResult.rows[0].personaData;
        const originalResponse = await twinService.generateSampleReply(currentStyleVector);
        const previewStyleVector = {
            ...currentStyleVector,
            ...styleChanges
        };
        const newResponse = await twinService.generateSampleReply(previewStyleVector);
        res.json({
            success: true,
            originalResponse,
            newResponse,
            previewStyleVector
        });
    }
    catch (error) {
        logger_1.logger.error('Preview style changes error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to preview style changes'
        });
    }
};
exports.previewStyleChanges = previewStyleChanges;
//# sourceMappingURL=twinEditController.js.map