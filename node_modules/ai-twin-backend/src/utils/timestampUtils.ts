/**
 * Timestamp Utility Functions
 * Ensures all timestamps are in UTC ISO format with 'Z' suffix
 * This is critical for frontend timezone conversion
 */

/**
 * Normalize timestamp to UTC ISO format with 'Z' suffix
 * Handles PostgreSQL timestamps, Date objects, and strings
 * @param timestamp - Timestamp from database (Date, string, or null)
 * @returns ISO string with 'Z' suffix or null
 */
export function normalizeTimestamp(timestamp: Date | string | null | undefined): string | null {
  if (!timestamp) return null;
  
  try {
    // If it's already a Date object, convert to ISO
    if (timestamp instanceof Date) {
      return timestamp.toISOString();
    }
    
    // If it's a string, ensure it has 'Z' suffix for UTC
    if (typeof timestamp === 'string') {
      const ts = timestamp.trim();
      
      // Already has 'Z' suffix - return as is
      if (ts.endsWith('Z')) {
        return ts;
      }
      
      // Has timezone offset (+05:30, -08:00) - convert to UTC first
      if (ts.match(/[+-]\d{2}:\d{2}$/)) {
        const date = new Date(ts);
        return date.toISOString();
      }
      
      // ISO format without timezone: 2025-11-20T05:43:00.123
      if (ts.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/)) {
        return ts + 'Z';
      }
      
      // SQL format: 2025-11-20 05:43:00.123
      if (ts.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/)) {
        return ts.replace(' ', 'T') + 'Z';
      }
      
      // PostgreSQL timestamp format: 2025-11-20 05:43:00.123456
      if (ts.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/)) {
        // Keep only 3 decimal places for milliseconds
        const parts = ts.split('.');
        if (parts[1] && parts[1].length > 3) {
          return parts[0].replace(' ', 'T') + '.' + parts[1].substring(0, 3) + 'Z';
        } else {
          return ts.replace(' ', 'T') + 'Z';
        }
      }
      
      // Try to parse as Date and convert
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
      
      // If we can't parse it, return as is (might already be valid)
      return ts;
    }
    
    return null;
  } catch (error) {
    console.error('[normalizeTimestamp] Error normalizing timestamp:', timestamp, error);
    return null;
  }
}

/**
 * Normalize an object's timestamp fields
 * Recursively processes objects and arrays
 * @param obj - Object or array to normalize
 * @param timestampFields - Array of field names that contain timestamps
 * @returns Normalized object
 */
export function normalizeTimestampsInObject<T>(obj: T, timestampFields: string[] = ['createdAt', 'updatedAt', 'lastActivity', 'timestamp', 'created_at', 'updated_at', 'last_activity']): T {
  if (!obj) return obj;
  
  // If it's an array, process each element
  if (Array.isArray(obj)) {
    return obj.map(item => normalizeTimestampsInObject(item, timestampFields)) as T;
  }
  
  // If it's an object, process it
  if (typeof obj === 'object') {
    const normalized = { ...obj } as any;
    
    for (const key in normalized) {
      if (timestampFields.includes(key)) {
        normalized[key] = normalizeTimestamp(normalized[key]);
      } else if (typeof normalized[key] === 'object' && normalized[key] !== null) {
        // Recursively process nested objects
        normalized[key] = normalizeTimestampsInObject(normalized[key], timestampFields);
      }
    }
    
    return normalized as T;
  }
  
  return obj;
}

/**
 * Calculate relative time string (e.g., "5m ago", "2h ago", "Just now")
 * Uses UTC time for calculation (timezone-independent)
 * @param timestamp - UTC timestamp (Date object or ISO string)
 * @returns Relative time string
 */
export function formatRelativeTime(timestamp: Date | string | null | undefined): string {
  if (!timestamp) return '';
  
  try {
    // ✅ CRITICAL: Date.now() already returns UTC milliseconds
    // No need for timezone conversion - both timestamps are in UTC
    const nowUTC = Date.now(); // UTC milliseconds
    
    let messageDate: Date;
    
    // Convert timestamp to Date object
    if (timestamp instanceof Date) {
      messageDate = timestamp;
    } else if (typeof timestamp === 'string') {
      messageDate = new Date(timestamp);
    } else {
      return '';
    }
    
    // Validate date
    if (isNaN(messageDate.getTime())) {
      return '';
    }
    
    // ✅ Calculate difference using UTC timestamps (both in milliseconds)
    const messageUTC = messageDate.getTime(); // UTC milliseconds
    const diff = nowUTC - messageUTC;
    
    // Future time check
    if (diff < 0) {
      return 'Just now';
    }
    
    // Calculate time units
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    // Return appropriate format
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  } catch (error) {
    console.error('[formatRelativeTime] Error formatting relative time:', timestamp, error);
    return '';
  }
}