/**
 * Backend template variable substitution utility
 * Processes ${variable} placeholders with recipient context data
 */

// Debug configuration
const DEBUG_TEMPLATES = process.env.DEBUG_TEMPLATES === 'true' || process.env.NODE_ENV === 'development';

function debugLog(message: string, ...args: any[]) {
  if (DEBUG_TEMPLATES) {
    console.log(message, ...args);
  }
}

export interface RecipientContext {
  email: string;
  name?: string;
  [key: string]: any; // Allow arbitrary template variables
}

/**
 * Substitutes ${variable} placeholders in content with values from recipient context
 * @param content - Template content with ${variable} placeholders
 * @param recipientContext - Object containing variable values (supports both flat and nested context)
 * @returns Processed content with substituted variables
 */
export function substituteTemplateVariables(content: string, recipientContext: RecipientContext): string {
  if (!recipientContext || typeof content !== 'string') {
    return content;
  }

  debugLog('[substituteTemplateVariables] Input:', {
    content: content.substring(0, 200) + (content.length > 200 ? '...' : ''),
    recipientContext: recipientContext
  });

  // Create a flat lookup object that includes both root-level and context properties
  const flatContext: Record<string, any> = { ...recipientContext };
  
  // If there's a context property, merge it into the flat lookup
  if (recipientContext.context && typeof recipientContext.context === 'object') {
    Object.assign(flatContext, recipientContext.context);
  }
  
  debugLog('[substituteTemplateVariables] Flat context:', flatContext);
  
  // Find all ${variable} patterns and replace them
  // Use match to avoid state issues with global regex
  let processedContent = content;
  const matches = content.match(/\$\{([^}]+)\}/g) || [];
  
  for (const fullMatch of matches) {
    const variableName = fullMatch.slice(2, -1).trim(); // Remove ${ and } and trim
    
    debugLog('[substituteTemplateVariables] Processing variable:', variableName);
    
    // Look for the variable in flat context (case-insensitive key lookup)
    let value = '';
    for (const [key, val] of Object.entries(flatContext)) {
      if (key.toLowerCase() === variableName.toLowerCase()) {
        value = String(val || '');
        debugLog('[substituteTemplateVariables] Found match:', { key, value });
        break;
      }
    }
    
    debugLog('[substituteTemplateVariables] Replacing:', { fullMatch, value });
    
    // Replace the placeholder with the actual value
    processedContent = processedContent.replace(fullMatch, value);
  }
  
  debugLog('[substituteTemplateVariables] Final result:', {
    originalLength: content.length,
    processedLength: processedContent.length,
    preview: processedContent.substring(0, 200) + (processedContent.length > 200 ? '...' : '')
  });
  
  return processedContent;
}

/**
 * Processes both subject and HTML content with template variables
 * @param subject - Email subject with potential ${variable} placeholders
 * @param html - Email HTML content with potential ${variable} placeholders
 * @param recipientContext - Object containing variable values
 * @returns Object with processed subject and html
 */
export function processEmailTemplate(
  subject: string, 
  html: string | undefined, 
  recipientContext: RecipientContext
): { subject: string; html: string | undefined } {
  debugLog('[processEmailTemplate] Called with:', {
    subject,
    htmlLength: html ? html.length : 0,
    recipientContext
  });
  
  const result = {
    subject: substituteTemplateVariables(subject, recipientContext),
    html: html ? substituteTemplateVariables(html, recipientContext) : undefined
  };
  
  debugLog('[processEmailTemplate] Result:', {
    processedSubject: result.subject,
    processedHtmlLength: result.html ? result.html.length : 0
  });
  
  return result;
}