# Security Policy

## Supported versions

Boxdex is a continuously-deployed static site: there is one supported version,
the code currently on `main`. There are no older release branches to patch.

## Reporting a vulnerability

**Do not open a public issue for a security vulnerability.**

Use GitHub's private reporting flow instead:
[Report a vulnerability](https://github.com/blamas/boxdex/security/advisories/new).
This opens a draft security advisory visible only to maintainers until a fix
is ready.

Include what you'd include in any good bug report: the affected component,
reproduction steps, and impact. For issues in the deployed Worker
(`worker/index.ts`, `worker/box-contribute.ts`), note whether you tested
against a self-hosted instance or the production site.

We'll acknowledge reports as soon as we can and keep you updated as the issue
is triaged and fixed. Credit is offered by default in the published advisory
unless you ask to stay anonymous.

## Scope

Boxdex is mostly static content served from Cloudflare R2 through a Worker.
The one piece of dynamic surface is `POST /api/box-contribute`
(`worker/box-contribute.ts`), the write endpoint behind the on-site
contribution form, gated by Cloudflare Turnstile and a GitHub App. Reports
about that endpoint, the Worker's request handling in general
(`worker/index.ts`, `worker/resolve.ts`), or the GitHub Actions deploy
pipeline are all in scope.

Reports about content in `data/` (incorrect driver specs, mislabelled
licenses) are not security issues, please [open a regular issue](../../issues)
or use the box-contribute form instead.

## Dependencies

Dependency vulnerabilities are tracked automatically via Dependabot
(`.github/dependabot.yml`) and CodeQL (`.github/workflows/codeql.yml`).
