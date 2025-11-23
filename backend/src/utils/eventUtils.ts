/**
 * Event utility functions for analytics
 */

export interface EventMeta {
    wv?: string;
    source?: string;
    twinId?: string;
    chatId?: string;
    landingPage?: string;
    [key: string]: any;
  }
  
  /**
   * Extract meaningful tags from event meta for display
   */
  export function extractEventTags(meta: any): string[] {
    if (!meta || typeof meta !== 'object') return [];
    
    const tags: string[] = [];
    
    // Standard meta keys to extract
    if (meta.wv) tags.push(`wv:${meta.wv}`);
    if (meta.source) tags.push(`source:${meta.source}`);
    if (meta.twinId) tags.push(`twin:${meta.twinId.substring(0, 8)}`);
    if (meta.chatId) tags.push(`chat:${meta.chatId.substring(0, 8)}`);
    if (meta.landingPage) tags.push(`page:${meta.landingPage}`);
    
    return tags;
  }
  
  /**
   * Format event meta for display (compact JSON preview)
   */
  export function formatEventMeta(meta: any, maxLength: number = 100): string {
    if (!meta || typeof meta !== 'object') return '';
    
    const relevantKeys = ['wv', 'source', 'twinId', 'chatId', 'landingPage'];
    const filtered: any = {};
    
    relevantKeys.forEach(key => {
      if (meta[key]) filtered[key] = meta[key];
    });
    
    const jsonStr = JSON.stringify(filtered);
    if (jsonStr.length <= maxLength) return jsonStr;
    
    return jsonStr.substring(0, maxLength - 3) + '...';
  }