/**
 * Centralized Error Logger Utility
 * 
 * Provides conditional logging based on environment:
 * - Development: Logs to browser console
 * - Production: Silent or sends to error tracking service (Sentry, etc.)
 * 
 * Usage:
 *   ErrorLogger.error('Error message', errorObject, { context: 'data' });
 *   ErrorLogger.warn('Warning message', data);
 *   ErrorLogger.info('Info message', data);
 */
(function() {
    'use strict';
    
    // Detect development environment
    const isDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.hostname.includes('dev') ||
                          window.location.hostname.includes('local');
    
    /**
     * Error Logger Object
     */
    window.ErrorLogger = {
        /**
         * Log error messages
         * @param {string} message - Error message
         * @param {Error|Object} error - Error object or data
         * @param {Object} context - Additional context data
         */
        error: function(message, error, context = {}) {
            // Development: Show in console
            if (isDevelopment) {
                if (error instanceof Error) {
                    console.error(`[ERROR] ${message}`, error, context);
                } else {
                    console.error(`[ERROR] ${message}`, error, context);
                }
            }
            
            // Production: Send to error tracking service if available
            if (!isDevelopment) {
                // TODO: Integrate Sentry or custom error tracking
                if (window.Sentry && error instanceof Error) {
                    window.Sentry.captureException(error, {
                        extra: { message, context }
                    });
                }
                // Silent in production if no tracking service
            }
        },
        
        /**
         * Log warning messages
         * @param {string} message - Warning message
         * @param {Object} data - Additional data
         */
        warn: function(message, data) {
            if (isDevelopment) {
                console.warn(`[WARN] ${message}`, data || '');
            }
            // Production: Silent (warnings are less critical)
        },
        
        /**
         * Log info messages
         * @param {string} message - Info message
         * @param {Object} data - Additional data
         */
        info: function(message, data) {
            if (isDevelopment) {
                console.info(`[INFO] ${message}`, data || '');
            }
            // Production: Silent
        },
        
        /**
         * Log debug messages (only in development)
         * @param {string} message - Debug message
         * @param {Object} data - Additional data
         */
        debug: function(message, data) {
            if (isDevelopment) {
                console.debug(`[DEBUG] ${message}`, data || '');
            }
        }
    };
    
    // Expose environment flag for conditional logic
    window.ErrorLogger.isDevelopment = isDevelopment;
})();

