import { describe, expect, it } from 'vitest';
import { applyFooterLines, parseFooterLines } from '../src/frontend/footer-lines.js';

describe('applyFooterLines', () => {
  it('removes an existing line and appends the new one at the bottom', () => {
    const html = '<p>Hello</p><div id="unsubscribe-link">old</div>';
    const out = applyFooterLines(html, [{ id: 'unsubscribe-link', html: '<div id="unsubscribe-link">new</div>' }]);
    expect(out).toContain('<p>Hello</p>');
    expect(out).not.toContain('old');
    expect(out.trim().endsWith('<div id="unsubscribe-link">new</div>')).toBe(true);
  });

  it('appends multiple lines in order', () => {
    const out = applyFooterLines('<p>x</p>', [
      { id: 'a', html: '<div id="a">A</div>' },
      { id: 'b', html: '<div id="b">B</div>' },
    ]);
    expect(out.indexOf('A')).toBeLessThan(out.indexOf('B'));
  });

  it('leaves content alone for an empty list', () => {
    expect(applyFooterLines('<p>x</p>', [])).toBe('<p>x</p>');
    expect(applyFooterLines('<p>x</p>', null)).toBe('<p>x</p>');
  });

  it('adds the footer to empty content', () => {
    expect(applyFooterLines('', [{ id: 'a', html: '<div id="a">A</div>' }])).toContain('A');
  });

  it('tolerates selector-special ids', () => {
    const out = applyFooterLines('<p>x</p>', [{ id: 'a"b', html: '<div id="a&quot;b">X</div>' }]);
    expect(out).toContain('X');
  });
});

describe('parseFooterLines', () => {
  it('parses valid JSON and rejects garbage', () => {
    expect(parseFooterLines(JSON.stringify([{ id: 'a', html: '<b>x</b>' }]))).toHaveLength(1);
    expect(parseFooterLines('not-json')).toEqual([]);
    expect(parseFooterLines(null)).toEqual([]);
  });
});
