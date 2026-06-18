export const normalizeWhitespace = (value = "") =>
  String(value).replace(/\s+/g, " ").trim();

export const slugify = (value = "") =>
  normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export const chunkText = (text, { maxChars = 4500, overlap = 300 } = {}) => {
  const normalized = text.replace(/\r/g, "");
  const chunks = [];
  let start = 0;

  while (start < normalized.length) {
    const hardEnd = Math.min(start + maxChars, normalized.length);
    const nextBreak = normalized.lastIndexOf("\n\n", hardEnd);
    const end = nextBreak > start + maxChars * 0.6 ? nextBreak : hardEnd;
    chunks.push(normalized.slice(start, end).trim());
    start = Math.max(end - overlap, end);
  }

  return chunks.filter(Boolean);
};
