// backend/src/utils/tokenAuthHelpers.ts

import { Request, Response } from 'express';
import { db } from '../config/database';
import { logger } from '../config/logger';
import { detokenizeId } from './idTokenization';
import { createError, ErrorCodes } from './errors';
import { verifyTwinOwnership } from './twinUtils';

/**
 * PHASE 6: Centralized token validation and auth helpers
 */

export interface TokenAuthContext {
  userId?: string;
  endpoint: string;
  resourceType: 'twin' | 'chat' | 'user';
}

/**
 * Validate and detokenize a resource token with auth check
 * 
 * @param token - Tokenized resource ID
 * @param expectedType - Expected resource type
 * @param context - Context for logging
 * @returns Decoded resource ID or throws error
 */
export function validateAndDetokenize(
  token: string,
  expectedType: 'twin' | 'chat' | 'user',
  context: TokenAuthContext
): string {
  if (!token) {
    logger.warn('validateAndDetokenize: Missing token', context);
    throw createError.validation(`${expectedType} token is required`, ErrorCodes.INVALID_INPUT);
  }

  const decoded = detokenizeId(token, {
    userId: context.userId,
    endpoint: context.endpoint
  });

  if (!decoded) {
    logger.warn('validateAndDetokenize: Invalid token', {
      ...context,
      tokenLength: token.length
    });
    throw createError.validation(`Invalid ${expectedType} token`, ErrorCodes.INVALID_INPUT);
  }

  if (decoded.type !== expectedType) {
    logger.warn('validateAndDetokenize: Token type mismatch', {
      ...context,
      expectedType,
      actualType: decoded.type
    });
    throw createError.validation(`Token type mismatch: expected ${expectedType}, got ${decoded.type}`, ErrorCodes.INVALID_INPUT);
  }

  return decoded.id;
}

/**
 * Validate twin token and verify ownership (for private operations)
 * 
 * @param twinToken - Tokenized twin ID
 * @param userId - User ID to verify ownership
 * @param endpoint - Endpoint name for logging
 * @returns Decoded twin ID or throws error
 */
export async function validateTwinTokenAndOwnership(
  twinToken: string,
  userId: string,
  endpoint: string
): Promise<string> {
  const twinId = validateAndDetokenize(twinToken, 'twin', {
    userId,
    endpoint,
    resourceType: 'twin'
  });

  // Verify ownership
  await verifyTwinOwnership(twinId, userId);

  return twinId;
}

/**
 * Validate chat token and verify user has access
 * 
 * @param chatToken - Tokenized chat ID
 * @param userId - User ID to verify access
 * @param endpoint - Endpoint name for logging
 * @returns Decoded chat ID or throws error
 */
export async function validateChatTokenAndAccess(
  chatToken: string,
  userId: string,
  endpoint: string
): Promise<string> {
  const chatId = validateAndDetokenize(chatToken, 'chat', {
    userId,
    endpoint,
    resourceType: 'chat'
  });

  // Verify user has access to this chat
  const chatResult = await db.query(`
    SELECT "userId" FROM "Chat"
    WHERE id = $1
  `, [chatId]);

  if (chatResult.rows.length === 0) {
    logger.warn('validateChatTokenAndAccess: Chat not found', {
      chatId,
      userId,
      endpoint
    });
    throw createError.notFound('Chat not found', ErrorCodes.CHAT_NOT_FOUND);
  }

  if (chatResult.rows[0].userId !== userId) {
    logger.warn('validateChatTokenAndAccess: Unauthorized access attempt', {
      chatId,
      userId,
      endpoint
    });
    throw createError.forbidden('Access denied to this chat', ErrorCodes.FORBIDDEN);
  }

  return chatId;
}

/**
 * Validate public twin token (no ownership check, just existence and visibility)
 * 
 * @param twinToken - Tokenized twin ID
 * @param endpoint - Endpoint name for logging
 * @returns Decoded twin ID and twin info or throws error
 */
export async function validatePublicTwinToken(
  twinToken: string,
  endpoint: string
): Promise<{ twinId: string; isPublic: boolean; blockNonLoggedUsers: boolean }> {
  const twinId = validateAndDetokenize(twinToken, 'twin', {
    endpoint,
    resourceType: 'twin'
  });

  const twinResult = await db.query(`
    SELECT id, "isPublic", "blockNonLoggedUsers"
    FROM "Twin"
    WHERE id = $1
  `, [twinId]);

  if (twinResult.rows.length === 0) {
    logger.warn('validatePublicTwinToken: Twin not found', {
      twinId,
      endpoint
    });
    throw createError.notFound('Twin not found', ErrorCodes.TWIN_NOT_FOUND);
  }

  const twin = twinResult.rows[0];

  if (!twin.isPublic) {
    logger.warn('validatePublicTwinToken: Twin is not public', {
      twinId,
      endpoint
    });
    throw createError.forbidden('Twin is not public', ErrorCodes.FORBIDDEN);
  }

  return {
    twinId,
    isPublic: twin.isPublic,
    blockNonLoggedUsers: twin.blockNonLoggedUsers
  };
}