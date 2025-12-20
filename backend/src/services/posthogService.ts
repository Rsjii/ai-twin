import { PostHog } from 'posthog-node';
import { logger } from '../config/logger';
import { tokenizeId } from '../utils/idTokenization';
import { StandardEventMeta } from './eventLogger';
import { isTest } from '../config/env';

let posthogClient: PostHog | null = null;

/**
 * Initialize PostHog client
 * Call this once at app startup
 */
export function initializePostHog(): void {
  const apiKey = process.env['POSTHOG_API_KEY'];
  const host = process.env['POSTHOG_HOST'] || 'https://app.posthog.com';

  if (isTest) {
    return; // never emit analytics in tests
  }

  if (!apiKey) {
    logger.warn('PostHog API key not found. PostHog tracking disabled.');
    return;
  }

  try {
    posthogClient = new PostHog(apiKey, {
      host,
      flushAt: 20, // Batch events
      flushInterval: 10000 // 10 seconds
    });

    logger.info('PostHog initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize PostHog:', error);
  }
}

/**
 * Capture event to PostHog
 * Fire-and-forget (async, no await)
 */
export function capturePostHogEvent(
  userId: string | null,
  eventName: string,
  properties?: StandardEventMeta
): void {
  if (!posthogClient) {
    return; // PostHog not initialized
  }

  try {
    // Use hashed public ID as distinct_id
    const distinctId = userId ? tokenizeId(userId, 'user') : 'anonymous';

    // Sanitize properties - remove any PII
    const sanitizedProperties: Record<string, any> = {
      ...properties,
      // Ensure we never send raw IDs
      userId: undefined,
      twinId: undefined,
      chatId: undefined,
      // Keep only public/tokenized IDs
      publicUserId: properties?.publicUserId,
      publicTwinId: properties?.publicTwinId,
      publicChatId: properties?.publicChatId,
      source: properties?.source,
      wv: properties?.wv,
      deviceType: properties?.deviceType,
      country: properties?.country
    };

    // Remove undefined values
    Object.keys(sanitizedProperties).forEach(key => {
      if (sanitizedProperties[key] === undefined) {
        delete sanitizedProperties[key];
      }
    });

    // Fire-and-forget: don't await
    posthogClient.capture({
      distinctId,
      event: eventName,
      properties: sanitizedProperties
    });

  } catch (error) {
    // Silent fail - don't break main flow
    logger.error('PostHog capture failed:', error);
  }
}

/**
 * Identify user in PostHog
 * Call when user signs up or logs in
 */
export function identifyPostHogUser(
  userId: string,
  properties?: {
    email?: string;
    handle?: string;
    createdAt?: string;
    [key: string]: any;
  }
): void {
  if (!posthogClient) {
    return;
  }

  try {
    const distinctId = tokenizeId(userId, 'user');

    // Never send email or PII
    const sanitizedProperties: Record<string, any> = {
      hasEmail: !!properties?.email,
      handle: properties?.handle,
      createdAt: properties?.createdAt,
      // Add other non-PII properties
      ...properties
    };

    // Remove email if present
    delete sanitizedProperties.email;

    posthogClient.identify({
      distinctId,
      properties: sanitizedProperties
    });

  } catch (error) {
    logger.error('PostHog identify failed:', error);
  }
}

/**
 * Shutdown PostHog gracefully
 * Call on app shutdown
 */
export function shutdownPostHog(): void {
  if (posthogClient) {
    posthogClient.shutdown();
    posthogClient = null;
    logger.info('PostHog shutdown complete');
  }
}
