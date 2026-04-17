# rabbitloop

Autonomous PR review fixer. Polls GitHub for review comments from bots (CodeRabbit, GitHub Actions) that you've approved with a 👍, dispatches a Claude instance to fix each one, and resolves the thread on success.

## How it works

```
poll GitHub PR
  → find unresolved bot review comments with 👍 from owner
  → for each: fire `claude --dangerously-skip-permissions` with the comment context
  → if Claude outputs <promise>COMPLETE</promise>: resolve the thread via GraphQL
  → sleep and repeat
```

No local state tracking — GitHub's resolved/unresolved thread state is the single source of truth.

## Usage

```bash
# Dry run — see what would be fixed without invoking Claude
bazel run //devtools/rabbitloop -- --repo arkeros/senku --pr 42 --once --dry-run

# Single pass — fix all approved comments and exit
bazel run //devtools/rabbitloop -- --repo arkeros/senku --pr 42 --once

# Continuous loop — poll every 2 minutes
bazel run //devtools/rabbitloop -- --repo arkeros/senku --pr 42

# Custom interval and owner
bazel run //devtools/rabbitloop -- --repo arkeros/senku --pr 42 --interval 60 --owner arkeros
```

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--repo` | required | GitHub repository (`OWNER/REPO`) |
| `--pr` | required | Pull request number |
| `--owner` | repo owner | GitHub user whose 👍 triggers fixes |
| `--interval` | 120 | Polling interval in seconds |
| `--once` | false | Run a single iteration then exit |
| `--dry-run` | false | Log what would be done without invoking Claude or resolving threads |
| `--log-level` | INFO | `DEBUG`, `INFO`, or `WARNING` |

## Prerequisites

- [`gh`](https://cli.github.com/) CLI authenticated with repo access
- [`claude`](https://docs.anthropic.com/en/docs/claude-code) CLI installed

## Supported bots

- [CodeRabbit](https://coderabbit.ai/) (`coderabbitai`)
- GitHub Actions (`github-actions[bot]`)
