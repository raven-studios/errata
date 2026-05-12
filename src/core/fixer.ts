import Anthropic from '@anthropic-ai/sdk';
import * as github from '@actions/github';
import type { Finding } from './findings.js';

export type Octokit = ReturnType<typeof github.getOctokit>;

export interface FixAttempt {
  finding: Finding;
  fixed: boolean;
  correctedContent?: string;
  reason?: string;
}

export async function getFileContent(
  octokit: Octokit,
  ref: string,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      ...github.context.repo,
      path: filePath,
      ref,
    });

    if (!('content' in data) || data.type !== 'file') return null;

    return {
      content: Buffer.from(data.content, 'base64').toString('utf-8'),
      sha: data.sha,
    };
  } catch {
    return null;
  }
}

export async function generateFix(
  finding: Finding,
  fileContent: string,
  apiKey: string,
): Promise<string | null> {
  if (!finding.suggestion) return null;

  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8096,
    messages: [
      {
        role: 'user',
        content: `Apply a specific fix to this file. Return the complete corrected file content only — no explanation, no markdown fences, no commentary. If the fix is ambiguous or risky, return the word SKIP on a single line.

File: ${finding.file}
Issue: ${finding.title}
Problem: ${finding.body}
How to fix: ${finding.suggestion}
${finding.line ? `Approximate line: ${finding.line}` : ''}

Current file content:
${fileContent}`,
      },
    ],
  });

  const corrected = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();

  if (!corrected || corrected === 'SKIP') return null;

  // Safety: reject if file changes by more than 40% in size
  const ratio = corrected.length / fileContent.length;
  if (ratio < 0.6 || ratio > 1.4) return null;

  return corrected;
}

export async function commitFixes(
  octokit: Octokit,
  branch: string,
  headSha: string,
  fixes: Array<{ path: string; content: string }>,
): Promise<string> {
  // Create blobs for each fixed file
  const blobs = await Promise.all(
    fixes.map(async fix => {
      const { data } = await octokit.rest.git.createBlob({
        ...github.context.repo,
        content: Buffer.from(fix.content).toString('base64'),
        encoding: 'base64',
      });
      return { path: fix.path, sha: data.sha };
    }),
  );

  // Get base tree SHA from current head commit
  const { data: baseCommit } = await octokit.rest.git.getCommit({
    ...github.context.repo,
    commit_sha: headSha,
  });

  // Create new tree on top of base
  const { data: newTree } = await octokit.rest.git.createTree({
    ...github.context.repo,
    base_tree: baseCommit.tree.sha,
    tree: blobs.map(b => ({
      path: b.path,
      mode: '100644' as const,
      type: 'blob' as const,
      sha: b.sha,
    })),
  });

  // Create commit
  const fileList = fixes.map(f => `- ${f.path}`).join('\n');
  const { data: newCommit } = await octokit.rest.git.createCommit({
    ...github.context.repo,
    message: `fix: apply Errata autofix suggestions\n\n${fileList}`,
    tree: newTree.sha,
    parents: [headSha],
  });

  // Advance branch ref
  await octokit.rest.git.updateRef({
    ...github.context.repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
  });

  return newCommit.sha;
}
