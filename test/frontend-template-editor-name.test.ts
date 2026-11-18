import { describe, it, expect, vi } from 'vitest';
import { resolveNewTemplateTitle } from '../src/frontend/template-editor-name.js';

describe('resolveNewTemplateTitle', () => {
  it('uses the form title when creating a brand new template', () => {
    expect(resolveNewTemplateTitle({ formTitle: '  Spring newsletter  ' })).toBe('Spring newsletter');
  });

  it('requires a title when creating a new template', () => {
    expect(resolveNewTemplateTitle({ formTitle: '   ' })).toBeNull();
  });

  it('prompts for a new name when an existing template is loaded', () => {
    const prompt = vi.fn(() => '  Copy of Spring newsletter  ');

    const result = resolveNewTemplateTitle({
      currentTitle: 'Spring newsletter',
      formTitle: 'Spring newsletter',
      prompt
    });

    expect(result).toBe('Copy of Spring newsletter');
    expect(prompt).toHaveBeenCalledWith(
      'Enter a name for the new template:',
      'Spring newsletter copy'
    );
  });

  it('uses a name the user already typed in the title field', () => {
    const prompt = vi.fn(() => 'ignored');

    const result = resolveNewTemplateTitle({
      currentTitle: 'Spring newsletter',
      formTitle: 'Summer newsletter',
      prompt
    });

    expect(result).toBe('Summer newsletter');
    expect(prompt).not.toHaveBeenCalled();
  });

  it('cancels the save when the prompt is dismissed', () => {
    expect(resolveNewTemplateTitle({
      currentTitle: 'Spring newsletter',
      formTitle: 'Spring newsletter',
      prompt: () => null
    })).toBeNull();
  });

  it('requires a non-empty name from the prompt', () => {
    expect(resolveNewTemplateTitle({
      currentTitle: 'Spring newsletter',
      formTitle: 'Spring newsletter',
      prompt: () => '   '
    })).toBeNull();
  });
});
