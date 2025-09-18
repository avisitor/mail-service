/**
 * Backend template variable substitution utility
 * Processes ${variable} placeholders with recipient context data
 */

export interface RecipientContext {
  email: string;
  name?: string;
  [key: string]: any; // Allow arbitrary template variables
}

/**
 * Substitutes ${variable} placeholders in content with values from recipient context
 * @param content - Template content with ${variable} placeholders
 * @param recipientContext - Object containing variable values
 * @returns Processed content with substituted variables
 */
export function substituteTemplateVariables(content: string, recipientContext: RecipientContext): string {
  if (!recipientContext || typeof content !== 'string') {
    return content;
  }

  let processedContent = content;
  
  // Find all ${variable} patterns and replace them
  const variablePattern = /\$\{([^}]+)\}/g;
  let match;
  
  while ((match = variablePattern.exec(content)) !== null) {
    const fullMatch = match[0]; // e.g., "${first name}"
    const variableName = match[1].trim(); // e.g., "first name"
    
    // Look for the variable in recipient context (case-insensitive key lookup)
    let value = '';
    for (const [key, val] of Object.entries(recipientContext)) {
      if (key.toLowerCase() === variableName.toLowerCase()) {
        value = String(val || '');
        break;
      }
    }
    
    // Replace the placeholder with the actual value
    processedContent = processedContent.replace(fullMatch, value);
  }
  
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
  return {
    subject: substituteTemplateVariables(subject, recipientContext),
    html: html ? substituteTemplateVariables(html, recipientContext) : undefined
  };
}