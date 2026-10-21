export function placeTextContent(extract: string, description?: string) {
  const summary = extract.trim();
  const paragraph = summary.split(/\n\s*\n|\n/)[0].trim();
  let cleaned = paragraph;
  // Pronunciation and translated names often contain periods which are not sentence endings.
  while (/\([^()]*\)/.test(cleaned))
    cleaned = cleaned.replace(/\([^()]*\)/g, '');
  // An old extract cut inside parentheses has no usable definition yet.
  if (/[()]/.test(cleaned))
    return { summary, description: description?.trim() || '' };
  cleaned = cleaned
    .normalize('NFD')
    .replace(/\u0301/g, '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
  const dash = cleaned.indexOf(' — ');
  if (dash >= 0) {
    const name = cleaned
      .slice(0, dash)
      .split(/ или |, устар\./)[0]
      .trim();
    cleaned = name + cleaned.slice(dash);
  }
  const first = cleaned.match(/^.*?[.!?](?=\s+[А-ЯЁA-Z]|$)/u)?.[0] || cleaned;
  return { summary, description: description?.trim() || first };
}
