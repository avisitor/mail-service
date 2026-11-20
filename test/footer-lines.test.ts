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

  it('removes an existing element whose id has selector-special characters', () => {
    const out = applyFooterLines('<p>x</p><div id="a&quot;b">old</div>', [
      { id: 'a"b', html: '<div id="a&quot;b">new</div>' },
    ]);
    expect(out).toContain('<p>x</p>');
    expect(out).not.toContain('old');
    expect(out).toContain('new');
  });

  it('removes an existing element whose id contains a newline', () => {
    const out = applyFooterLines('<p>x</p><div id="a&#10;b">old</div>', [
      { id: 'a\nb', html: '<div id="a&#10;b">new</div>' },
    ]);
    expect(out).toContain('<p>x</p>');
    expect(out).not.toContain('old');
    expect(out).toContain('new');
  });

  it('leaves content alone when no line is usable', () => {
    expect(applyFooterLines('<p>x</p>', [{ id: '', html: '' }])).toBe('<p>x</p>');
  });
});

describe('parseFooterLines', () => {
  it('parses valid JSON and rejects garbage', () => {
    expect(parseFooterLines(JSON.stringify([{ id: 'a', html: '<b>x</b>' }]))).toHaveLength(1);
    expect(parseFooterLines('not-json')).toEqual([]);
    expect(parseFooterLines(null)).toEqual([]);
  });

  it('rejects entries whose html is missing or not a string', () => {
    expect(parseFooterLines('[{"id":"a"}]')).toEqual([]);
    expect(parseFooterLines('[{"id":"a","html":123}]')).toEqual([]);
    expect(parseFooterLines('[{"id":"a","html":"<b>x</b>"},{"id":"b"}]')).toHaveLength(1);
  });
});
