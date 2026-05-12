import * as core from '@actions/core';
import * as github from '@actions/github';
import { getOctokit, fetchPRDiff, postFixSummaryComment } from './adapters/github.js';
import { parseDiff, buildDiffContext } from './core/differ.js';
import { loadRules } from './core/rules.js';
import { review } from './core/reviewer.js';
import { getFileContent, generateFix, commitFixes } from './core/fixer.js';

async function run(): Promise<void> {
  const comment = github.context.payload.comment as { body?: string } | undefined;
  const issue = github.context.payload.issue as { number?: number; pull_request?: unknown } | undefined;

  if (!comment?.body?.includes('/errata fix')) {
    core.info('Comment does not contain /errata fix — skipping.');
    return;
  }

  if (!issue?.pull_request) {
    core.info('Comment is not on a pull request — skipping.');
    return;
  }

  const prNumber = issue.number!;
  const apiKey = core.getInput('anthropic-api-key', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  const octokit = getOctokit(githubToken);

  // Get PR details to find the branch and head SHA
  const { data: pr } = await octokit.rest.pulls.get({
    ...github.context.repo,
    pull_number: prNumber,
  });

  const branch = pr.head.ref;
  const headSha = pr.head.sha;

  core.info(`Errata Autofix triggered on PR #${prNumber} (${branch})`);

  // React to the comment so the user knows we're on it
  const commentId = (github.context.payload.comment as { id?: number } | undefined)?.id;
  if (commentId) {
    await octokit.rest.reactions.createForIssueComment({
      ...github.context.repo,
      comment_id: commentId,
      content: 'eyes',
    });
  }

  // Re-run the review to get fresh findings
  const rawDiff = await fetchPRDiff(githubToken, prNumber);
  const diffFiles = parseDiff(rawDiff);

  if (diffFiles.length === 0) {
    core.info('No diff to fix.');
    return;
  }

  const rules = await loadRules('.');
  const diffContext = buildDiffContext(diffFiles);

  const result = await review({
    diffContext,
    rules,
    stack: 'unknown',
    hasTests: false,
    minSeverity: 'should-fix',
    apiKey,
  });

  const fixable = result.findings.filter(f => f.suggestion);

  if (fixable.length === 0) {
    await octokit.rest.issues.createComment({
      ...github.context.repo,
      issue_number: prNumber,
      body: '**Errata Autofix** — No auto-fixable issues found. The remaining findings require manual review.',
    });
    return;
  }

  core.info(`Attempting ${fixable.length} fix(es)...`);

  const fixes: Array<{ path: string; content: string }> = [];
  const results: Array<{ title: string; fixed: boolean; reason?: string }> = [];

  for (const finding of fixable) {
    const file = await getFileContent(octokit, branch, finding.file);

    if (!file) {
      results.push({ title: finding.title, fixed: false, reason: `Could not read ${finding.file}` });
      continue;
    }

    const corrected = await generateFix(finding, file.content, apiKey);

    if (!corrected) {
      results.push({ title: finding.title, fixed: false, reason: 'Fix was too ambiguous or risky to apply automatically' });
      continue;
    }

    fixes.push({ path: finding.file, content: corrected });
    results.push({ title: finding.title, fixed: true });
  }

  if (fixes.length > 0) {
    core.info(`Committing ${fixes.length} fix(es) to ${branch}...`);
    await commitFixes(octokit, branch, headSha, fixes);
  }

  await postFixSummaryComment(octokit, prNumber, results);

  core.info('Autofix complete.');
}

run().catch(err => core.setFailed(err instanceof Error ? err.message : String(err)));
