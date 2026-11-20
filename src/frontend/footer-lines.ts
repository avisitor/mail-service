export interface FooterLine {
  id: string;
  html: string;
}

export function applyFooterLines(html: string, lines: FooterLine[] | null | undefined): string {
  if (!lines || lines.length === 0) {
    return html;
  }
  const valid = lines.filter(line => line && line.id);
  if (valid.length === 0) {
    return html;
  }

  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';

  for (const line of valid) {
    wrapper.querySelectorAll('[id]').forEach(el => {
      if (el.id === line.id) {
        el.parentNode?.removeChild(el);
      }
    });
  }
  for (const line of valid) {
    if (line.html) {
      wrapper.insertAdjacentHTML('beforeend', line.html);
    }
  }
  return wrapper.innerHTML;
}

export function parseFooterLines(value: string | null): FooterLine[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter(line => line && typeof line.id === 'string' && typeof line.html === 'string')
      : [];
  } catch {
    return [];
  }
}
