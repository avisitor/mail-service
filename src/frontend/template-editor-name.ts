/**
 * Resolve the title to use when "Save as New" creates a template.
 *
 * When an existing template is loaded, the form's title field still holds the
 * old title. Saving directly therefore creates a duplicate name, so ask for a
 * new one. When no template is loaded, the title field already is the name the
 * user typed and is used as-is.
 */
export interface NewTemplateTitleOptions {
  currentTitle?: string | null;
  formTitle: string;
  prompt?: (message: string, defaultValue?: string) => string | null;
}

export function resolveNewTemplateTitle(
  options: NewTemplateTitleOptions
): string | null {
  const formTitle = (options.formTitle || '').trim();

  if (!options.currentTitle) {
    return formTitle || null;
  }

  // The user already typed a different name in the title field; use it.
  if (formTitle && formTitle !== options.currentTitle.trim()) {
    return formTitle;
  }

  const promptFn = options.prompt
    ?? ((message: string, defaultValue?: string) => window.prompt(message, defaultValue));
  const entered = promptFn(
    'Enter a name for the new template:',
    `${options.currentTitle} copy`
  );

  if (entered === null) {
    return null;
  }

  return entered.trim() || null;
}
