export interface Chunk {
  key: string;
  heading: string;
  content: string;
}

const MAX_CHUNK_CHARS = 2000;
const MIN_CHUNK_CHARS = 50;

export function chunkMarkdown(filePath: string, text: string): Chunk[] {
  const lines = text.split("\n");
  const raw: Chunk[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    const key = currentHeading ? `${filePath}#${currentHeading}` : filePath;
    raw.push({ key, heading: currentHeading, content });
  };

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      flush();
      currentHeading = match[2].trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  if (raw.length === 0) {
    raw.push({ key: filePath, heading: "", content: text.trim() });
  }

  const split: Chunk[] = [];
  for (const chunk of raw) {
    if (chunk.content.length <= MAX_CHUNK_CHARS) {
      split.push(chunk);
      continue;
    }
    const paragraphs = chunk.content.split(/\n\n+/);
    let buf = "";
    let partIdx = 0;
    for (const para of paragraphs) {
      if (buf && buf.length + para.length + 2 > MAX_CHUNK_CHARS) {
        const suffix = partIdx > 0 ? ` (${partIdx + 1})` : "";
        split.push({
          key: `${chunk.key}${suffix}`,
          heading: chunk.heading,
          content: buf.trim(),
        });
        buf = "";
        partIdx++;
      }
      buf += (buf ? "\n\n" : "") + para;
    }
    if (buf.trim()) {
      const suffix = partIdx > 0 ? ` (${partIdx + 1})` : "";
      split.push({
        key: `${chunk.key}${suffix}`,
        heading: chunk.heading,
        content: buf.trim(),
      });
    }
  }

  const merged: Chunk[] = [];
  for (const chunk of split) {
    if (merged.length > 0 && merged[merged.length - 1].content.length < MIN_CHUNK_CHARS) {
      const prev = merged[merged.length - 1];
      prev.content += "\n\n" + chunk.content;
      if (!prev.heading && chunk.heading) {
        prev.heading = chunk.heading;
        prev.key = chunk.key;
      }
    } else {
      merged.push({ ...chunk });
    }
  }

  return merged;
}
