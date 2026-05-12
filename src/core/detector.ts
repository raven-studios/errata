import fs from 'fs/promises';
import path from 'path';
import type { Dirent } from 'fs';

export interface RepoContext {
  stack: string;
  hasTests: boolean;
}

const MANIFEST_MAP: Array<[string, string]> = [
  ['package.json', 'JavaScript/TypeScript'],
  ['pyproject.toml', 'Python'],
  ['requirements.txt', 'Python'],
  ['go.mod', 'Go'],
  ['Cargo.toml', 'Rust'],
  ['Gemfile', 'Ruby'],
  ['pom.xml', 'Java (Maven)'],
  ['build.gradle.kts', 'Kotlin (Gradle)'],
  ['build.gradle', 'Java (Gradle)'],
  ['composer.json', 'PHP'],
];

const TEST_DIR_SIGNALS = new Set([
  '__tests__', 'tests', 'test', 'spec', '__spec__', 'e2e', 'cypress',
]);

const TEST_FILE_PATTERNS = [
  /\.test\.[tj]sx?$/,
  /\.spec\.[tj]sx?$/,
  /_test\.go$/,
  /test_[^/]+\.py$/,
  /[^/]+_test\.py$/,
  /[^/]+_spec\.rb$/,
];

export async function detectRepoContext(repoPath = '.'): Promise<RepoContext> {
  const entries = await fs.readdir(repoPath, { withFileTypes: true }).catch(() => []);
  const names = entries.map(e => e.name);

  const stack = await detectStack(repoPath, names);
  const hasTests = await detectTestInfrastructure(repoPath, entries);

  return { stack, hasTests };
}

async function detectStack(repoPath: string, rootFileNames: string[]): Promise<string> {
  for (const [manifest, lang] of MANIFEST_MAP) {
    if (rootFileNames.includes(manifest)) {
      if (manifest === 'package.json') {
        return refineNodeStack(repoPath);
      }
      return lang;
    }
  }

  // Fallback: look for .csproj anywhere one level deep
  const csproj = rootFileNames.find(f => f.endsWith('.csproj'));
  if (csproj) return 'C# (.NET)';

  return 'unknown';
}

async function refineNodeStack(repoPath: string): Promise<string> {
  try {
    const raw = await fs.readFile(path.join(repoPath, 'package.json'), 'utf-8');
    const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    if ('typescript' in deps || 'ts-node' in deps) {
      if ('next' in deps) return 'TypeScript (Next.js)';
      if ('react' in deps) return 'TypeScript (React)';
      return 'TypeScript (Node.js)';
    }
    if ('react' in deps) return 'JavaScript (React)';
    return 'JavaScript (Node.js)';
  } catch {
    return 'JavaScript/TypeScript';
  }
}

async function detectTestInfrastructure(repoPath: string, entries: Dirent[]): Promise<boolean> {
  for (const entry of entries) {
    if (entry.isDirectory() && TEST_DIR_SIGNALS.has(entry.name)) return true;
    if (entry.isFile() && TEST_FILE_PATTERNS.some(p => p.test(entry.name))) return true;
  }

  // One level deeper — check src/ and lib/ subdirs
  const subdirs = entries.filter((e: Dirent) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules');
  for (const subdir of subdirs.slice(0, 8)) {
    const subEntries = await fs.readdir(path.join(repoPath, subdir.name), { withFileTypes: true }).catch(() => []);
    for (const entry of subEntries) {
      if (entry.isDirectory() && TEST_DIR_SIGNALS.has(entry.name)) return true;
      if (entry.isFile() && TEST_FILE_PATTERNS.some(p => p.test(entry.name))) return true;
    }
  }

  return false;
}
