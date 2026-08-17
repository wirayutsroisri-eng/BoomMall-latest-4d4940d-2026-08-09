import { legalDoc, type LegalDocKey } from './copy';

function esc(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderLegalHtml(key: LegalDocKey): string {
  const doc = legalDoc(key);
  const other = key === 'privacy' ? 'terms' : 'privacy';
  const otherLabel = key === 'privacy' ? 'Terms of Use' : 'Privacy Policy';
  const sections = doc.sections
    .map(
      (s) => `
    <section>
      <h2>${esc(s.headingEn)}</h2>
      <p>${esc(s.bodyEn)}</p>
      <h3 lang="th">${esc(s.headingTh)}</h3>
      <p lang="th">${esc(s.bodyTh)}</p>
    </section>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(doc.titleEn)} — BoomMall</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 720px; margin: 0 auto; padding: 32px 20px 64px; color: #111; line-height: 1.55; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    .th { color: #444; font-size: 18px; margin: 0 0 16px; }
    .meta { color: #666; font-size: 14px; margin-bottom: 28px; }
    section { margin-bottom: 28px; }
    h2 { font-size: 18px; margin: 0 0 8px; }
    h3 { font-size: 15px; color: #333; margin: 16px 0 6px; }
    p { margin: 0 0 8px; }
    nav a { color: #0a6; }
  </style>
</head>
<body>
  <p><strong>BoomMall</strong></p>
  <h1>${esc(doc.titleEn)}</h1>
  <p class="th">${esc(doc.titleTh)}</p>
  <p class="meta">Last updated: ${esc(doc.updated)}</p>
  ${sections}
  <nav>
    <a href="/legal/${other}">${esc(otherLabel)}</a>
  </nav>
</body>
</html>`;
}
