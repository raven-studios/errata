import fs from 'fs/promises';
import path from 'path';
import defaultRulesContent from '../rules/default.md';

export async function loadRules(repoPath = '.'): Promise<string> {
  const customPath = path.join(repoPath, '.errata.md');
  let customRules = '';

  try {
    customRules = await fs.readFile(customPath, 'utf-8');
  } catch {
    // No custom rules — fine
  }

  if (!customRules.trim()) return defaultRulesContent;

  return `${defaultRulesContent}\n\n## Repo-level overrides (.errata.md)\n\n${customRules}`;
}
