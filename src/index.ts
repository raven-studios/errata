import * as core from '@actions/core';
import * as github from '@actions/github';
import { detectRepoContext } from './core/detector.js';
import { parseDiff, buildDiffContext } from './core/differ.js';
import { loadRules } from './core/rules.js';
import { review } from './core/reviewer.js';
import { fetchPRDiff, postSummaryComment } from './adapters/github.js';
import { SeveritySchema } from './core/findings.js';

async function run(): Promise<void> {
  if (!github.context.payload.pull_request) {
    core.info('Not a pull_request event — skipping.');
    return;
  }

  const apiKey = core.getInput('anthropic-api-key', { required: true });
  const githubToken = core.getInput('github-token', { required: true });
  const maxFiles = parseInt(core.getInput('max-files') || '50', 10);

  const minSeverityRaw = core.getInput('min-severity') || 'should-fix';
  const minSeverityParsed = SeveritySchema.safeParse(minSeverityRaw);
  if (!minSeverityParsed.success) {
    core.setFailed(`Invalid min-severity value: "${minSeverityRaw}". Must be must-fix, should-fix, or consider.`);
    return;
  }
  const minSeverity = minSeverityParsed.data;

  core.info('Detecting repository context...');
  const repoContext = await detectRepoContext('.');
  core.info(`Stack: ${repoContext.stack} | Tests detected: ${repoContext.hasTests}`);

  core.info('Loading rules...');
  const rules = await loadRules('.');

  core.info('Fetching PR diff...');
  const rawDiff = await fetchPRDiff(githubToken);

  const diffFiles = parseDiff(rawDiff);
  if (diffFiles.length === 0) {
    core.info('Diff is empty or contains only skipped files — nothing to review.');
    return;
  }

  if (diffFiles.length > maxFiles) {
    core.warning(`PR touches ${diffFiles.length} files. Reviewing first ${maxFiles} only (increase max-files to raise the limit).`);
    diffFiles.splice(maxFiles);
  }

  const diffContext = buildDiffContext(diffFiles);

  core.info(`Running Errata (min-severity: ${minSeverity})...`);
  const result = await review({
    diffContext,
    rules,
    stack: repoContext.stack,
    hasTests: repoContext.hasTests,
    minSeverity,
    apiKey,
  });

  core.info(`Review complete: ${result.findings.length} finding(s).`);

  await postSummaryComment(githubToken, result);

  const blockers = result.findings.filter(f => f.severity === 'must-fix');
  if (blockers.length > 0) {
    core.setFailed(`Errata found ${blockers.length} must-fix issue(s). Resolve them before merging.`);
  }
}

run().catch(err => core.setFailed(err instanceof Error ? err.message : String(err)));
