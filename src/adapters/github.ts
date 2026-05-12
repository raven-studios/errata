import * as core from '@actions/core';
import * as github from '@actions/github';
import { SEVERITY_ORDER, type Finding, type Review, type Severity } from '../core/findings.js';

type Octokit = ReturnType<typeof github.getOctokit>;

export function getOctokit(token: string): Octokit {
  return github.getOctokit(token);
}

export async function fetchPRDiff(token: string): Promise<string> {
  const octokit = getOctokit(token);
  const pr = github.context.payload.pull_request;
  if (!pr) throw new Error('No pull_request in event payload');

  const response = await octokit.rest.pulls.get({
    ...github.context.repo,
    pull_number: pr.number as number,
    mediaType: { format: 'diff' },
  });

  return response.data as unknown as string;
}

export async function postSummaryComment(token: string, review: Review): Promise<void> {
  const octokit = getOctokit(token);
  const pr = github.context.payload.pull_request;
  if (!pr) throw new Error('No pull_request in event payload');

  const body = formatReviewComment(review);

  await octokit.rest.issues.createComment({
    ...github.context.repo,
    issue_number: pr.number as number,
    body,
  });

  core.info(`Posted review comment (${review.findings.length} finding(s)).`);
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
      lines.push('');
      lines.push(formatFinding(finding));
    }
  }

  lines.push('', footer());
  return lines.join('\n');
}

function formatFinding(f: Finding): string {
  const location = f.line ? `\`${f.file}:${f.line}\`` : `\`${f.file}\``;
  const parts = [`**${f.title}** — ${location}`, '', f.body];
  if (f.suggestion) {
    parts.push('', '<details><summary>Suggested fix</summary>', '', '```', f.suggestion, '```', '', '</details>');
  }
  return parts.join('\n');
}

function footer(): string {
  return '_Reviewed by [Errata](https://erratahq.com) · [Configure](.errata.md)_';
}
