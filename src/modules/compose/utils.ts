// Utility functions for parsing recipients and handling template data

export interface ParsedRecipient {
  email: string;
  name?: string;
  context: Record<string, any>;
}

/**
 * Parse recipient data from textarea input
 * Supports both simple email format and extended format with key-value pairs
 * 
 * Simple format:
 * - user@example.com
 * - John Doe <user@example.com>
 * 
 * Extended format (handled internally by mail-service):
 * - user@example.com:John Doe:name=John:company=ACME
 * 
 * @param recipientsText Raw text from textarea
 * @returns Array of parsed recipients
 */
export function parseRecipients(recipientsText: string): ParsedRecipient[] {
  const lines = recipientsText.trim().split('\n').filter(line => line.trim().length > 0);
  const recipients: ParsedRecipient[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Check if line contains extended format with key-value pairs
    if (trimmedLine.includes(':')) {
      const parts = trimmedLine.split(':');
      const email = parts[0].trim();
      const name = parts.length > 1 ? parts[1].trim() : undefined;
      
      // Parse key-value pairs from remaining parts
      const context: Record<string, any> = {};
      for (let i = 2; i < parts.length; i++) {
        const kvPair = parts[i].trim();
        if (kvPair.includes('=')) {
          const [key, value] = kvPair.split('=', 2);
          context[key.trim()] = value.trim();
        }
      }
      
      recipients.push({
        email: extractEmailAddress(email),
        name: name || extractNameFromEmail(email),
        context
      });
    } else {
      // Simple email format
      const email = extractEmailAddress(trimmedLine);
      const name = extractNameFromEmail(trimmedLine);
      
      recipients.push({
        email,
        name,
        context: {}
      });
    }
  }
  
  return recipients;
}

/**
 * Extract email address from various formats:
 * - user@example.com
 * - John Doe <user@example.com>
 * - "John Doe" <user@example.com>
 */
function extractEmailAddress(input: string): string {
  const emailRegex = /<([^>]+)>$/;
  const match = input.match(emailRegex);
  
  if (match) {
    return match[1].trim();
  }
  
  // If no angle brackets, assume the whole string is the email
  return input.trim();
}

/**
 * Extract name from email format like "John Doe <user@example.com>"
 */
function extractNameFromEmail(input: string): string | undefined {
  const nameRegex = /^(.+?)\s*<[^>]+>$/;
  const match = input.match(nameRegex);
  
  if (match) {
    let name = match[1].trim();
    // Remove surrounding quotes if present
    if ((name.startsWith('"') && name.endsWith('"')) || 
        (name.startsWith("'") && name.endsWith("'"))) {
      name = name.slice(1, -1);
    }
    return name;
  }
  
  return undefined;
}

/**
 * Generate a unique message ID for tracking
 */
export function generateMessageId(): string {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15);
}

/**
 * Generate a group ID for related messages
 */
export function generateGroupId(): string {
  return 'grp_' + Math.random().toString(36).substring(2, 15);
}

/**
 * Insert tracking pixel into HTML content
 */
export function insertTrackingPixel(htmlContent: string, messageId: string, baseUrl: string): string {
  const trackingPixel = `<img src="${baseUrl}/api/track-open/${messageId}" width="1" height="1" style="display:none" alt="">`;
  
  // Try to insert before closing body tag
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${trackingPixel}</body>`);
  }
  
  // If no body tag, append to end
  return htmlContent + trackingPixel;
}

/**
 * Remove existing tracking pixels from content (for previous messages)
 */
export function removeTrackingPixels(htmlContent: string): string {
  // Remove tracking pixel images
  const trackingPixelRegex = /<img[^>]*\/api\/track-open\/[^>]*>/gi;
  return htmlContent.replace(trackingPixelRegex, '');
}

/**
 * Remove app-specific footers from content
 */
export function removeAppFooters(htmlContent: string): string {
  // This is a placeholder - specific footer patterns would be defined per app
  // For now, remove common unsubscribe patterns
  const footerPatterns = [
    /<div[^>]*class[^>]*footer[^>]*>.*?<\/div>/gis,
    /<p[^>]*>.*?unsubscribe.*?<\/p>/gis,
    /<div[^>]*>.*?click here to stop receiving.*?<\/div>/gis
  ];
  
  let cleanedContent = htmlContent;
  for (const pattern of footerPatterns) {
    cleanedContent = cleanedContent.replace(pattern, '');
  }
  
  return cleanedContent;
}

/**
 * Add app-specific footer to content
 */
export function addAppFooter(htmlContent: string, appId: string, baseUrl: string): string {
  // This would be configured per app - for now, use a generic footer
  const footer = `
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 12px; color: #666;">
      <p>You received this email because you are subscribed to updates.</p>
      <p><a href="${baseUrl}/unsubscribe?app=${appId}">Click here to unsubscribe</a></p>
    </div>
  `;
  
  // Try to insert before closing body tag
  if (htmlContent.includes('</body>')) {
    return htmlContent.replace('</body>', `${footer}</body>`);
  }
  
  // If no body tag, append to end
  return htmlContent + footer;
}