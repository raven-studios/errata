import * as core from '@actions/core';
import * as github from '@actions/github';
import { SEVERITY_ORDER, type Finding, type Review, type Severity } from '../core/findings.js';

export type Octokit = ReturnType<typeof github.getOctokit>;

const ERRATA_MARKER = '<!-- errata-review -->';

export function getOctokit(token: string): Octokit {
  return github.getOctokit(token);
}

export async function fetchPRDiff(token: string, prNumber?: number): Promise<string> {
  const octokit = getOctokit(token);
  const number = prNumber ?? (github.context.payload.pull_request?.number as number | undefined);
  if (!number) throw new Error('No pull request number available');

  const response = await octokit.rest.pulls.get({
    ...github.context.repo,
    pull_number: number,
    mediaType: { format: 'diff' },
  });

  return response.data as unknown as string;
}

export async function postSummaryComment(token: string, review: Review): Promise<void> {
  const octokit = getOctokit(token);
  const pr = github.context.payload.pull_request;
  if (!pr) throw new Error('No pull_request in event payload');

  const prNumber = pr.number as number;
  const body = formatReviewComment(review);
  const existingId = await findErrataComment(octokit, prNumber);

  if (existingId) {
    await octokit.rest.issues.updateComment({
      ...github.context.repo,
      comment_id: existingId,
      body,
    });
    core.info(`Updated existing Errata comment (${review.findings.length} finding(s)).`);
  } else {
    await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: prNumber,
      body,
    });
    core.info(`Posted Errata review comment (${review.findings.length} finding(s)).`);
  }
}

export async function postFixSummaryComment(
  octokit: Octokit,
  prNumber: number,
  results: Array<{ title: string; fixed: boolean; reason?: string }>,
): Promise<void> {
  const fixed = results.filter(r => r.fixed);
  const skipped = results.filter(r => !r.fixed);

  const lines = ['**Errata Autofix**', ''];

  if (fixed.length > 0) {
    lines.push(`✅ Fixed ${fixed.length} issue(s) and pushed to this branch:`, '');
    for (const r of fixed) lines.push(`- ${r.title}`);
  }

  if (skipped.length > 0) {
    lines.push('', `⚠️ ${skipped.length} issue(s) need manual review:`, '');
    for (const r of skipped) {
      lines.push(`- **${r.title}**${r.reason ? ` — ${r.reason}` : ''}`);
    }
  }

  await octokit.rest.issues.createComment({
    ...github.context.repo,
    issue_number: prNumber,
    body: lines.join('\n'),
  });
}

async function findErrataComment(octokit: Octokit, prNumber: number): Promise<number | null> {
  const { data: comments } = await octokit.rest.issues.listComments({
    ...github.context.repo,
    issue_number: prNumber,
    per_page: 100,
  });

  const match = comments.find(
    c => c.user?.type === 'Bot' && c.body?.includes(ERRATA_MARKER),
  );

  return match?.id ?? null;
}

function formatReviewComment(review: Review): string {
  const icon: Record<string, string> = {
    'must-fix': '🔴',
    'should-fix': '🟡',
    'consider': '🔵',
  };
  const label: Record<string, string> = {
    'must-fix': 'Must Fix',
    'should-fix': 'Should Fix',
    'consider': 'Consider',
  };

  const lines: string[] = [
    ERRATA_MARKER,
    '## Errata Review',
    '',
    review.summary,
  ];

  if (review.findings.length === 0) {
    lines.push('', '✅ No issues found.');
    lines.push('', footer());
    return lines.join('\n');
  }

  const sorted = [...review.findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );

  const groups = (['must-fix', 'should-fix', 'consider'] as Severity[]).filter(s =>
    sorted.some(f => f.severity === s),
  );

  for (const severity of groups) {
    const group = sorted.filter(f => f.severity === severity);
    lines.push('', `### ${icon[severity]} ${label[severity]}`);
    for (const finding of group) {
      lines.push('', formatFinding(finding));
    }
  }

  lines.push('', footer());
  return lines.join('\n');
}

function formatFinding(f: Finding): string {
  const location = f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
  const parts = [`**${f.title}** — ${location}`, '', f.body];
  if (f.suggestion) {
    parts.push(
      '',
      '<details><summary>Suggested fix</summary>',
      '',
      '```',
      f.suggestion,
      '```',
      '',
      '</details>',
    );
  }
  return parts.join('\n');
}

function footer(): string {
  return '_Reviewed by [Errata](https://erratahq.com) · [Configure](.errata.md) · Reply `/errata fix` to auto-apply safe fixes_';
}
