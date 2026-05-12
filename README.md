# Errata

**AI-powered PR review that flags bugs, security issues, and real problems — not formatting nitpicks.**

[![GitHub release](https://img.shields.io/github/v/release/raven-studios/errata)](https://github.com/raven-studios/errata/releases)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)

Errata reviews your pull requests using Claude. It detects your stack automatically, applies a battle-tested ruleset, and posts a structured summary directly on the PR. When it finds something, it's almost always worth acting on.

---

## Quick start

**Step 1 — Add your Anthropic API key as a repository secret:**

`Settings → Secrets and variables → Actions → New repository secret`

Name it `ANTHROPIC_API_KEY`.

**Step 2 — Add the workflow file:**

Create `.github/workflows/errata.yml` in your repository:

```yaml
name: Errata Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: raven-studios/errata@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

That's it. Every PR gets reviewed automatically.

---

## What Errata flags

**Correctness** — Logic errors, off-by-one, null handling, error paths that swallow failures, race conditions, boundary conditions.

**Security** — Unvalidated input reaching DBs or shells, auth gaps on new endpoints, secrets in code or logs, injection vectors (SQL, XSS, path traversal, SSRF), crypto misuse.

**Performance** — N+1 queries, blocking I/O on hot paths, unbounded loops or memory growth.

**Maintainability** — Code that fights existing conventions, duplicated logic, misleading names, new public APIs without clear contracts.

**Tests** — New behavior without coverage, tests modified to pass rather than code being made correct, brittle assertions. *(Only flagged when the repo has test infrastructure.)*

## What Errata does NOT flag

Errata deliberately ignores:

- Style and formatting (use a linter)
- Unchanged code
- Hypothetical issues with no evidence in the diff
- "Add a comment" suggestions
- Premature abstractions or unnecessary refactors
- Defensive programming for impossible states
- Library or pattern preferences
- Cosmetic naming

> The #1 reason teams abandon AI code review is noise. Errata's default ruleset is designed around what NOT to flag just as much as what to flag.

---

## Severity levels

| Level | Meaning | Blocks merge by default? |
|---|---|---|
| 🔴 Must Fix | Will likely cause an incident, data loss, or security breach | Yes |
| 🟡 Should Fix | Real problem but not catastrophic | No |
| 🔵 Consider | Nudge or question — author may dismiss | No |

---

## Configuration

All inputs are optional — sensible defaults are provided.

```yaml
- uses: raven-studios/errata@v1
  with:
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    min-severity: should-fix   # must-fix | should-fix | consider  (default: should-fix)
    fail-on: must-fix          # must-fix | should-fix | consider | never  (default: must-fix)
    max-files: 50              # max changed files to review  (default: 50)
```

**`min-severity`** — The lowest severity level Errata will report. Set to `must-fix` for a Bugbot-style "only when it really matters" experience.

**`fail-on`** — The severity at which Errata marks the check as failed, enabling branch protection to block the merge. Set to `never` if you want reviews without blocking.

**`max-files`** — PRs that touch more files than this limit are reviewed on the first N files only. Large PRs can be split or the limit raised.

---

## Autofix

Add a second workflow to enable the `/errata fix` slash command.

Create `.github/workflows/errata-fix.yml`:

```yaml
name: Errata Autofix

on:
  issue_comment:
    types: [created]

jobs:
  fix:
    if: contains(github.event.comment.body, '/errata fix') && github.event.issue.pull_request
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: write
    steps:
      - uses: raven-studios/errata/fix@v1
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

When a reviewer or author comments `/errata fix` on a PR:

1. Errata reacts with 👀 so you know it's working
2. Re-reviews the PR to get fresh findings
3. Generates fixes for findings that have clear, safe solutions
4. Commits all fixes in a single commit directly to the PR branch
5. Posts a summary of what was fixed and what still needs manual attention

Errata declines to auto-fix anything ambiguous or risky and explains why.

---

## Custom rules

Add a `.errata.md` file to the root of your repository to extend or override the default ruleset. Errata merges your rules with the defaults — you don't need to rewrite everything.

```markdown
# .errata.md

## Project-specific rules

- This project uses Supabase RLS for all auth. Flag any endpoint that bypasses RLS or uses the service role key outside of admin-only server functions.
- All user-facing error messages must be sanitized before display. Flag any finding where raw error objects or stack traces could reach the client.
- We never store PII in local state or logs. Flag any instance of user email, name, or address being written to console or localStorage.
```

Rules are plain English — no special syntax required. The more specific you are, the sharper the findings.

---

## Stack detection

Errata automatically detects your project's language and framework by scanning manifest files. No configuration needed.

| Detected from | Stack |
|---|---|
| `package.json` + `typescript` dep | TypeScript (Node.js) |
| `package.json` + `next` dep | TypeScript (Next.js) |
| `package.json` + `react` dep | TypeScript (React) |
| `pyproject.toml` or `requirements.txt` | Python |
| `go.mod` | Go |
| `Cargo.toml` | Rust |
| `Gemfile` | Ruby |
| `pom.xml` | Java (Maven) |
| `build.gradle.kts` | Kotlin (Gradle) |
| `composer.json` | PHP |
| `*.csproj` | C# (.NET) |

Test infrastructure is also auto-detected. If your repo has no test files or test directories, Errata will not flag missing tests.

---

## How it works

1. On PR open or push, Errata fetches the unified diff via the GitHub API
2. Lockfiles, minified files, and source maps are automatically excluded
3. Your repo's stack and test infrastructure are detected from manifest files
4. The diff is sent to Claude along with the ruleset and detected context
5. The default ruleset is cached via Anthropic's prompt caching — only the diff is fresh tokens, keeping costs low
6. Claude returns structured findings (severity, file, line, title, body, suggested fix)
7. Findings are filtered to the configured `min-severity`
8. A formatted summary comment is posted (or the existing one updated) on the PR
9. If any finding meets `fail-on`, the check is marked as failed

---

## Roadmap

- [ ] Language-specific rule packs (TypeScript, Python, Go, Rust)
- [ ] Learned rules — capture 👍/👎 reactions on findings to auto-update `.errata/learned.md`
- [ ] GitHub App for one-click install (no workflow file needed)
- [ ] Atlassian Forge app for Bitbucket Pipelines
- [ ] Inline PR comments (in addition to summary comment)

---

## License

Apache 2.0 — see [LICENSE](LICENSE).

Errata is provided **as-is, with no warranties of any kind**. Use of this software is entirely at your own risk. See License §7 (Disclaimer of Warranty) and §8 (Limitation of Liability) for the full terms.

---

Built by [Raven Studios](https://ravenstudios.com)
