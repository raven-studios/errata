export interface DiffFile {
  path: string;
  hunks: string[];
}

const SKIP_EXTENSIONS = new Set([
  '.lock', '.snap', '.min.js', '.min.css', '.map',
]);

const SKIP_FILENAMES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Gemfile.lock',
  'Cargo.lock', 'poetry.lock', 'composer.lock',
]);

export function parseDiff(rawDiff: string): DiffFile[] {
  const files: DiffFile[] = [];
  const fileChunks = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const pathMatch = chunk.match(/^a\/.+ b\/(.+)\n/);
    if (!pathMatch) continue;

    const filePath = pathMatch[1].trim();
    if (shouldSkipFile(filePath)) continue;

    const hunks: string[] = [];
    const hunkBlocks = chunk.split(/^(?=@@ )/m).slice(1);
    for (const hunk of hunkBlocks) {
      hunks.push(hunk.trim());
    }

    if (hunks.length > 0) {
      files.push({ path: filePath, hunks });
    }
  }

  return files;
}

export function buildDiffContext(files: DiffFile[], maxChars = 80_000): string {
  const sections: string[] = [];
  let total = 0;

  for (const file of files) {
    const content = `\n### ${file.path}\n\`\`\`diff\n${file.hunks.join('\n')}\n\`\`\``;
    if (total + content.length > maxChars) break;
    sections.push(content);
    total += content.length;
  }

  return sections.join('\n');
}

function shouldSkipFile(filePath: string): boolean {
  const filename = filePath.split('/').pop() ?? '';
  if (SKIP_FILENAMES.has(filename)) return true;

  const ext = filename.includes('.') ? '.' + filename.split('.').slice(1).join('.') : '';
  if (SKIP_EXTENSIONS.has(ext)) return true;

  return false;
}
