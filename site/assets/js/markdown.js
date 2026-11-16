/**
 * Minimal, XSS-safe Markdown renderer for GitHub release notes.
 * Escapes all HTML first, then parses blocks and inline formatting.
 */

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function renderInline(escapedText) {
  const codeSlots = [];
  let text = escapedText.replace(/`([^`\n]+)`/g, (_, code) => {
    const idx = codeSlots.length;
    codeSlots.push(`<code>${code}</code>`);
    return `\x00C${idx}\x00`;
  });

  // Markdown links: [label](https://...) — only allow https:// URLs.
  const linkSlots = [];
  text = text.replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, (_, label, url) => {
    const idx = linkSlots.length;
    linkSlots.push(
      `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`,
    );
    return `\x00L${idx}\x00`;
  });

  // Bare https:// URLs outside existing markdown links.
  text = text.replace(/(^|[\s(])(https:\/\/[^\s<)\]]+)/g, (_, prefix, url) => {
    let cleanUrl = url;
    let trailing = '';
    while (/[.,;:!?]$/.test(cleanUrl)) {
      trailing = cleanUrl.slice(-1) + trailing;
      cleanUrl = cleanUrl.slice(0, -1);
    }
    const idx = linkSlots.length;
    linkSlots.push(
      `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>`,
    );
    return `${prefix}\x00L${idx}\x00${trailing}`;
  });

  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');

  text = text.replace(/\x00L(\d+)\x00/g, (_, i) => linkSlots[Number(i)]);
  text = text.replace(/\x00C(\d+)\x00/g, (_, i) => codeSlots[Number(i)]);
  return text;
}

export function renderMarkdown(md) {
  const raw = String(md ?? '').replace(/\r\n?/g, '\n').trim();
  if (!raw) return '<p class="muted">No release notes provided.</p>';

  const escaped = escapeHtml(raw);
  const blocks = [];

  // Pull fenced code blocks out so their lines aren't parsed as headings/lists.
  const withPlaceholders = escaped.replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => {
    const idx = blocks.length;
    blocks.push(`<pre><code>${code.replace(/\n+$/, '')}</code></pre>`);
    return `\n\x00B${idx}\x00\n`;
  });

  const lines = withPlaceholders.split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    const blockMatch = trimmed.match(/^\x00B(\d+)\x00$/);
    if (blockMatch) {
      html.push(blocks[Number(blockMatch[1])]);
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      html.push('<hr>');
      i += 1;
      continue;
    }

    const headingMatch = line.match(/^\s*(#{1,5})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length <= 2 ? 'h3' : 'h4';
      html.push(`<${level}>${renderInline(headingMatch[2].trim())}</${level}>`);
      i += 1;
      continue;
    }

    if (/^\s*&gt;\s?/.test(line)) {
      const quoteLines = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
        quoteLines.push(renderInline(lines[i].replace(/^\s*&gt;\s?/, '')));
        i += 1;
      }
      html.push(`<blockquote><p>${quoteLines.join('<br>')}</p></blockquote>`);
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*[-*+]\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(`<li>${renderInline(lines[i].replace(/^\s*\d+\.\s+/, ''))}</li>`);
        i += 1;
      }
      html.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^\s*(#{1,5}\s+|[-*+]\s+|\d+\.\s+|&gt;\s?)/.test(lines[i]) &&
      !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
      !/^\x00B\d+\x00$/.test(lines[i].trim())
    ) {
      paraLines.push(renderInline(lines[i].trim()));
      i += 1;
    }
    html.push(`<p>${paraLines.join('<br>')}</p>`);
  }

  return html.join('');
}
