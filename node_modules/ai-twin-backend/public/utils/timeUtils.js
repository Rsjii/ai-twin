/**
 * Time Utility Functions
 * Handles timezone-aware time formatting for UTC timestamps from database
 * Supports both exact time (user timezone) and relative time display
 */

// ✅ DEBUG MODE: Set to false in production to disable console logs
const DEBUG_MODE = true; // Change to false for production

// ✅ Global server time storage - updated from API responses
let globalServerTime = null;

/**
 * Set global server time (called from API responses)
 * @param {string} serverTime - ISO string of server time
 */
function setServerTime(serverTime) {
  if (serverTime) {
    globalServerTime = serverTime;
    debugLog('[TimeUtils] ✅ Global server time updated:', serverTime);
    debugLog('[TimeUtils] ✅ Verified globalServerTime:', globalServerTime);
  } else {
    debugWarn('[TimeUtils] ⚠️ setServerTime called with empty value');
  }
}

/**
 * Debug logger - only logs if DEBUG_MODE is true
 */
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log('[TimeUtils]', ...args);
  }
}

function debugError(...args) {
  if (DEBUG_MODE) {
    console.error('[TimeUtils]', ...args);
  }
}

function debugWarn(...args) {
  if (DEBUG_MODE) {
    console.warn('[TimeUtils]', ...args);
  }
}

/**
 * Get user's timezone automatically from browser
 * @returns {string} IANA timezone identifier (e.g., "Asia/Kolkata", "America/New_York")
 */
function getUserTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    debugLog('getUserTimeZone - Detected:', tz);
    return tz;
  } catch (e) {
    debugWarn('Could not detect timezone, using UTC:', e);
    return 'UTC'; // Fallback
  }
}

/**
 * Normalize timestamp to ensure UTC parsing
 * Handles timestamps without timezone info by adding 'Z' suffix
 * @param {string|Date|number} timestamp - Timestamp from database
 * @returns {string|Date|number} Normalized timestamp (with Z suffix if needed)
 */
function normalizeTimestamp(timestamp) {
  if (!timestamp) return timestamp;
  
  // If already a Date object or number, return as is
  if (timestamp instanceof Date || typeof timestamp === 'number') {
    return timestamp;
  }
  
  // If string, ensure UTC format
  if (typeof timestamp === 'string') {
    let normalized = timestamp.trim();
    
    // ISO format without timezone: 2025-01-19T18:53:32.123
    // Check if it matches ISO format but doesn't have Z or timezone offset
    if (normalized.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$/) && 
        !normalized.includes('Z') && 
        !normalized.includes('+') && 
        !normalized.match(/-\d{2}:\d{2}$/)) {
      normalized = normalized + 'Z';
      debugLog('Normalized ISO timestamp (added Z):', timestamp, '→', normalized);
    }
    // SQL format: 2025-01-19 18:53:32.123
    else if (normalized.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,3})?$/)) {
      normalized = normalized.replace(' ', 'T') + 'Z';
      debugLog('Normalized SQL timestamp (added T and Z):', timestamp, '→', normalized);
    }
    // PostgreSQL timestamp format: 2025-01-19 18:53:32.123456
    else if (normalized.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/)) {
      // Keep only 3 decimal places for milliseconds
      const parts = normalized.split('.');
      if (parts[1] && parts[1].length > 3) {
        normalized = parts[0] + '.' + parts[1].substring(0, 3) + 'Z';
      } else {
        normalized = normalized.replace(' ', 'T') + 'Z';
      }
      debugLog('Normalized PostgreSQL timestamp:', timestamp, '→', normalized);
    }
    
    return normalized;
  }
  
  return timestamp;
}

/**
 * Format exact time according to user's timezone
 * @param {string|Date|number} utcTimestamp - UTC timestamp from database (ISO string, Date object, or milliseconds)
 * @param {object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted time string in user's timezone
 */
function formatExactTime(utcTimestamp, options = {}) {
  if (!utcTimestamp) return '';
  
  try {
    const userTimeZone = getUserTimeZone();
    
    // ✅ FIX: Normalize timestamp to ensure UTC parsing
    const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
    
    // ✅ DETAILED DEBUG LOGS
    debugLog('═══════════════════════════════════════════════════════');
    debugLog('formatExactTime - START');
    debugLog('  Input timestamp:', utcTimestamp);
    debugLog('  Normalized timestamp:', normalizedTimestamp);
    debugLog('  User timezone:', userTimeZone);
    debugLog('  Options provided:', JSON.stringify(options));
    
    // ✅ Create Date object from UTC timestamp
    const date = new Date(normalizedTimestamp);
    
    // ✅ Validate date
    if (isNaN(date.getTime())) {
      debugError('  ❌ Invalid date object created from:', normalizedTimestamp);
      return '';
    }
    
    // ✅ Log UTC time details
    const utcTime = date.toISOString();
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    debugLog('  UTC Time (from Date object):', utcTime);
    debugLog('  UTC Hours:', utcHours, 'UTC Minutes:', utcMinutes);
    
    // ✅ Build final options - CRITICAL: timeZone must be set
    const defaultOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimeZone  // ✅ ALWAYS SET USER TIMEZONE
    };
    
    // ✅ Merge options - but ensure timeZone is never overridden unless explicitly provided
    const finalOptions = { ...defaultOptions, ...options };
    
    // ✅ If options.timeZone was provided, use it (but log warning)
    if (options.timeZone && options.timeZone !== userTimeZone) {
      debugWarn('  ⚠️ Overriding user timezone with:', options.timeZone);
      finalOptions.timeZone = options.timeZone;
    } else {
      // ✅ Ensure timeZone is always set to user's timezone
      finalOptions.timeZone = userTimeZone;
    }
    
    debugLog('  Final options:', JSON.stringify(finalOptions));
    
    // ✅ Convert to user's timezone using toLocaleString
    const result = date.toLocaleString('en-US', finalOptions);
    
    // ✅ Also get time-only for verification
    const timeOnly = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimeZone
    });
    
    // ✅ Log conversion details
    debugLog('  Conversion Result:', result);
    debugLog('  Time Only:', timeOnly);
    debugLog('  Expected conversion: UTC', utcHours + ':' + String(utcMinutes).padStart(2, '0'), '→', userTimeZone, timeOnly);
    debugLog('formatExactTime - END');
    debugLog('═══════════════════════════════════════════════════════');
    
    return result;
  } catch (e) {
    debugError('❌ Error formatting exact time:', e);
    debugError('  Input was:', utcTimestamp);
    debugError('  Stack:', e.stack);
    return '';
  }
}

/**
 * Format relative time (timezone independent - works correctly with UTC)
 * Uses Intl.RelativeTimeFormat for better localization
 * @param {string|Date|number} utcTimestamp - UTC timestamp from database
 * @returns {string} Relative time string (e.g., "2h ago", "3d ago")
 */
function formatRelativeTime(utcTimestamp, serverTime = null) {
  if (!utcTimestamp) return '';
  
  try {
    // ✅ FIX: Normalize timestamp to ensure UTC parsing
    const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
    
    // ✅ DEBUG: Log timestamp for debugging
    debugLog('formatRelativeTime - Input:', utcTimestamp, 'Normalized:', normalizedTimestamp);
    
    const dbTime = new Date(normalizedTimestamp).getTime();
    
    // Validate date
    if (isNaN(dbTime)) {
      debugError('Invalid timestamp:', utcTimestamp, 'Normalized:', normalizedTimestamp);
      return '';
    }
    
    // ✅ CRITICAL FIX: Use server time if available, otherwise fallback to browser time
    // Server time is more reliable than browser system clock
    let now;
    const effectiveServerTime = serverTime || globalServerTime;
    if (effectiveServerTime) {
      const serverDate = new Date(effectiveServerTime);
      now = serverDate.getTime();
      debugLog('formatRelativeTime - Using SERVER time:', effectiveServerTime);
    } else {
      now = Date.now();
      debugLog('formatRelativeTime - Using BROWSER time (fallback)');
    }
    
    const diff = now - dbTime;
    
    // ✅ DEBUG: Log calculation with more details
    const dbDate = new Date(normalizedTimestamp);
    const nowDate = effectiveServerTime ? new Date(effectiveServerTime) : new Date();
    debugLog('formatRelativeTime - DB Time (UTC):', dbDate.toISOString(), 
                'DB Time (Local):', dbDate.toLocaleString(),
                'Now (UTC):', nowDate.toISOString(),
                'Now (Local):', nowDate.toLocaleString(),
                'Diff (ms):', diff, 
                'Diff (hours):', (diff / (1000 * 60 * 60)).toFixed(2),
                'Diff (minutes):', (diff / (1000 * 60)).toFixed(2));
    
    // Future time check
    if (diff < 0) {
      debugWarn('Future timestamp detected:', normalizedTimestamp, 'Diff:', diff);
      return 'Just now';
    }
    
    // ✅ Use Intl.RelativeTimeFormat for better formatting
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);
    
    // ✅ More detailed logging
    debugLog('formatRelativeTime - Calculated:', {
      seconds,
      minutes,
      hours,
      days,
      result: seconds < 60 ? 'Just now' : 
              minutes < 60 ? `${minutes}m ago` :
              hours < 24 ? `${hours}h ago` :
              days < 7 ? `${days}d ago` :
              weeks < 4 ? `${weeks}w ago` :
              months < 12 ? `${months}mo ago` :
              `${years}y ago`
    });
    
    if (seconds < 60) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    if (weeks < 4) return `${weeks}w ago`;
    if (months < 12) return `${months}mo ago`;
    return `${years}y ago`;
  } catch (e) {
    debugError('Error formatting relative time:', e, 'Input:', utcTimestamp);
    return '';
  }
}

/**
 * Smart time formatter - shows relative for recent, exact for old
 * Similar to Twitter/Facebook approach
 * @param {string|Date|number} utcTimestamp - UTC timestamp
 * @param {number} thresholdHours - Show relative if less than this (default: 24)
 * @returns {string} Formatted time
 */
function formatSmartTime(utcTimestamp, thresholdHours = 24, serverTime = null) {
  if (!utcTimestamp) return '';
  
  try {
    // ✅ FIX: Normalize timestamp
    const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
    
    const dbTime = new Date(normalizedTimestamp).getTime();
    if (isNaN(dbTime)) {
      debugError('Invalid timestamp in formatSmartTime:', utcTimestamp);
      return '';
    }
    
    // ✅ FIX: Use server time if available
    let now;
    const effectiveServerTime = serverTime || globalServerTime;
    if (effectiveServerTime) {
      const serverDate = new Date(effectiveServerTime);
      now = serverDate.getTime();
    } else {
      now = Date.now();
    }
    
    const diff = now - dbTime;
    const hours = diff / (1000 * 60 * 60);
    const minutes = diff / (1000 * 60);
    const seconds = Math.floor(diff / 1000);
    
    // ✅ FIX: For very recent messages (< 1 minute), show "Just now"
    if (seconds < 60) {
      return 'Just now';
    }
    
    // ✅ FIX: For messages < 1 hour, show "Xm ago"
    if (minutes < 60) {
      return `${Math.floor(minutes)}m ago`;
    }
    
    // ✅ FIX: For messages < 24 hours, show "Xh ago"
    if (hours < thresholdHours) {
      return formatRelativeTime(normalizedTimestamp, serverTime);
    } else {
      return formatExactTime(normalizedTimestamp);
    }
  } catch (e) {
    debugError('Error formatting smart time:', e, 'Input:', utcTimestamp);
    return '';
  }
}

/**
 * Format date only (no time) - user's timezone
 * @param {string|Date|number} utcTimestamp - UTC timestamp
 * @returns {string} Formatted date string
 */
function formatDateOnly(utcTimestamp) {
  return formatExactTime(utcTimestamp, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format time only (no date) - user's timezone
 * @param {string|Date|number} utcTimestamp - UTC timestamp
 * @returns {string} Formatted time string
 */
function formatTimeOnly(utcTimestamp) {
  if (!utcTimestamp) return '';
  
  try {
    const userTimeZone = getUserTimeZone();
    const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
    
    debugLog('formatTimeOnly - START');
    debugLog('  Input:', utcTimestamp);
    debugLog('  Normalized:', normalizedTimestamp);
    debugLog('  User TZ:', userTimeZone);
    
    const date = new Date(normalizedTimestamp);
    if (isNaN(date.getTime())) {
      debugError('Invalid timestamp in formatTimeOnly:', utcTimestamp);
      return '';
    }
    
    // ✅ Get UTC time for verification
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    debugLog('  UTC Time:', utcHours + ':' + String(utcMinutes).padStart(2, '0'));
    
    // ✅ EXPLICITLY convert to user's timezone
    const result = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: userTimeZone
    });
    
    debugLog('  Result:', result);
    debugLog('  Expected: UTC', utcHours + ':' + String(utcMinutes).padStart(2, '0'), '→', userTimeZone, result);
    debugLog('formatTimeOnly - END');
    
    return result;
  } catch (e) {
    debugError('Error formatting time only:', e, 'Input:', utcTimestamp);
    return '';
  }
}

/**
 * Format with context (like Facebook: "Today at 3:45 PM", "Yesterday at 3:45 PM")
 * @param {string|Date|number} utcTimestamp - UTC timestamp
 * @returns {string} Contextual time string
 */
function formatTimeWithContext(utcTimestamp, serverTime = null) {
  if (!utcTimestamp) return '';
  
  try {
    const userTimeZone = getUserTimeZone();
    
    // ✅ FIX: Normalize timestamp
    const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
    
    // ✅ DETAILED DEBUG LOGS
    debugLog('═══════════════════════════════════════════════════════');
    debugLog('formatTimeWithContext - START');
    debugLog('  Input:', utcTimestamp);
    debugLog('  Normalized:', normalizedTimestamp);
    debugLog('  User TZ:', userTimeZone);
    const effectiveServerTime = serverTime || globalServerTime;
    debugLog('  Server Time:', effectiveServerTime || 'Not provided (using browser time)');
    
    const dbTime = new Date(normalizedTimestamp).getTime();
    if (isNaN(dbTime)) {
      debugError('  ❌ Invalid timestamp in formatTimeWithContext:', utcTimestamp);
      return '';
    }
    
    // ✅ FIX: Use server time if available
    let now;
    if (effectiveServerTime) {
      const serverDate = new Date(effectiveServerTime);
      now = serverDate.getTime();
    } else {
      now = Date.now();
    }
    
    const diff = now - dbTime;
    const hours = diff / (1000 * 60 * 60);
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    // ✅ Log UTC time
    const date = new Date(normalizedTimestamp);
    const utcHours = date.getUTCHours();
    const utcMinutes = date.getUTCMinutes();
    debugLog('  UTC Time:', utcHours + ':' + String(utcMinutes).padStart(2, '0'));
    debugLog('  Hours diff:', hours.toFixed(2));
    debugLog('  Days diff:', days);
    
    const today = effectiveServerTime ? new Date(effectiveServerTime) : new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Check if same day (in user's timezone)
    const dateStr = date.toLocaleDateString('en-US', { timeZone: userTimeZone });
    const todayStr = today.toLocaleDateString('en-US', { timeZone: userTimeZone });
    const yesterdayStr = yesterday.toLocaleDateString('en-US', { timeZone: userTimeZone });
    
    debugLog('  Date comparison:');
    debugLog('    Message date (user TZ):', dateStr);
    debugLog('    Today (user TZ):', todayStr);
    debugLog('    Yesterday (user TZ):', yesterdayStr);
    
    let result;
    
    if (hours < 1) {
      debugLog('  → Using formatRelativeTime (hours < 1)');
      result = formatRelativeTime(normalizedTimestamp, effectiveServerTime);
    } else if (hours < 24) {
      debugLog('  → Using formatRelativeTime (hours < 24)');
      result = formatRelativeTime(normalizedTimestamp, effectiveServerTime);
    } else if (dateStr === todayStr) {
      debugLog('  → Using "Today at" format');
      const timeOnly = formatTimeOnly(normalizedTimestamp);
      result = `Today at ${timeOnly}`;
      debugLog('  → TimeOnly result:', timeOnly);
    } else if (dateStr === yesterdayStr) {
      debugLog('  → Using "Yesterday at" format');
      const timeOnly = formatTimeOnly(normalizedTimestamp);
      result = `Yesterday at ${timeOnly}`;
      debugLog('  → TimeOnly result:', timeOnly);
    } else if (days < 7) {
      debugLog('  → Using formatRelativeTime (days < 7)');
      result = formatRelativeTime(normalizedTimestamp, effectiveServerTime);
    } else {
      debugLog('  → Using formatExactTime');
      result = formatExactTime(normalizedTimestamp);
    }
    
    debugLog('  Final Result:', result);
    debugLog('  Expected: UTC', utcHours + ':' + String(utcMinutes).padStart(2, '0'), '→', userTimeZone, result);
    debugLog('formatTimeWithContext - END');
    debugLog('═══════════════════════════════════════════════════════');
    
    return result;
  } catch (e) {
    debugError('❌ Error formatting time with context:', e, 'Input:', utcTimestamp);
    debugError('  Stack:', e.stack);
    return formatExactTime(utcTimestamp);
  }
}

/**
 * Get full date-time string with timezone info (for tooltips/hover)
 * @param {string|Date|number} utcTimestamp - UTC timestamp
 * @returns {string} Full formatted string with timezone
 */
function formatFullDateTime(utcTimestamp) {
  // ✅ FIX: Normalize timestamp
  const normalizedTimestamp = normalizeTimestamp(utcTimestamp);
  
  return formatExactTime(normalizedTimestamp, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  });
}

// Export functions for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    getUserTimeZone,
    normalizeTimestamp,
    formatExactTime,
    formatRelativeTime,
    formatSmartTime,
    formatDateOnly,
    formatTimeOnly,
    formatTimeWithContext,
    formatFullDateTime
  };
} else {
  // Browser environment - attach to window
  window.TimeUtils = {
    getUserTimeZone,
    normalizeTimestamp,
    formatExactTime,
    formatRelativeTime,
    formatSmartTime,
    formatDateOnly,
    formatTimeOnly,
    formatTimeWithContext,
    formatFullDateTime,
    setServerTime, // ✅ Export function to update server time from API responses
    // ✅ DEBUG: Expose getter for debugging
    get globalServerTime() {
        return globalServerTime;
      }
  };
}

