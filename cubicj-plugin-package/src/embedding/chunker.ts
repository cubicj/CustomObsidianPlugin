export interface Chunk {
  key: string;
  heading: string;
  content: string;
}

export function chunkMarkdown(filePath: string, text: string): Chunk[] {
  const lines = text.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading = "";
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    const key = currentHeading ? `${filePath}#${currentHeading}` : filePath;
    chunks.push({ key, heading: currentHeading, content });
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

  if (chunks.length === 0) {
    chunks.push({ key: filePath, heading: "", content: text.trim() });
  }

  return chunks;
}
