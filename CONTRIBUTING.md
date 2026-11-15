# Contributing

Thanks for your interest in this project! This document describes how we collaborate and what to keep in mind before opening an issue or a pull request.

## Collaboration workflow

All changes go through the following five steps:

1. **Issue** — Open an issue describing the problem or feature. Work starts from an issue, not from a branch.
2. **Branch** — Create a feature branch from the latest `main`. Name it after the issue, e.g. `feature/12-market-panel` or `fix/15-auth-timeout`.
3. **Pull request** — Open a PR against `main` once the change is ready. Use the PR template: explain the motivation, list the changes, and show how you verified them.
4. **Review** — Every PR is reviewed before merge. Address review feedback in follow-up commits on the same branch; keep the discussion in the PR.
5. **Squash merge** — PRs are squash-merged into `main`, so the history stays linear and each commit on `main` corresponds to one reviewed change.

## Public repository boundaries

This repository is public. Anything you write here — issues, PRs, commit messages, code comments — can be read by anyone on the internet.

- Do not leak internal codenames, private planning references, or personal information in any public artifact.
- Never commit credentials, tokens, or secrets. Use environment variables and `.env` files that are covered by `.gitignore`.
- Write code comments, commit messages, and documentation in English.
- Reference the related issue in commit messages using natural language, e.g. `fix: handle token refresh on 401 (#12)`. The squash merge will carry the PR number automatically.

## AI-Assisted Development

This project is developed through an AI-assisted workflow built on **Claude Code**, Anthropic's agentic coding harness. Multiple large language models serve in distinct roles — planning, implementation, and independent review — including:

- **Kimi K3.1 Pro** (Moonshot AI, `kimi-k3.1-pro`)
- **Kimi K3** (Moonshot AI, `kimi-k3`)
- **Kimi K2.8 Preview** (Moonshot AI, `kimi-for-coding`)
- **DeepSeek-V4.1-Flash-1017** (DeepSeek, served as `deepseek-flash`)

All design decisions, code reviews, and merges are supervised and approved by the maintainer. AI agents implement; the maintainer decides.
