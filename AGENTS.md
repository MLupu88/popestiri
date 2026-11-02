# PopeȘtiri — mandatory agent instructions

**Always read these FIRST in any session:** docs/PROJECT_STATUS.md, docs/roadmap.md, docs/WORKING_AGREEMENT.md, docs/CHANGELOG.md, docs/SERVER_RUNBOOK.md. Read docs/PROJECT_AUDIT_2026-11-02.md for baseline evidence.

## Objective
PopeȘtiri is an **automatic Romanian viral-claim detection and fact-checking newspaper**, not a generic headline aggregator or community-submissions platform. Discover claims automatically, assess observable spread, collect primary evidence, require an editorial decision, publish a public fact-check, then create a print-ready A4 edition.

## Workflow (CRITICAL)
1. Work using **Codex or Claude Code**, on a small feature branch from up-to-date origin/main. No direct main commits or server edits.
2. Run pnpm typecheck, pnpm test and relevant additional tests. Confirm any migrations are additive and safe.
3. **EVERY functional PR MUST update in the same PR** docs/roadmap.md, docs/PROJECT_STATUS.md and docs/CHANGELOG.md. CI has a Project docs continuity gate. Record the milestone, test evidence, TODOs, blocker, next exact step and code/merge/deploy/live verified states. If changing deployment, update docs/SERVER_RUNBOOK.md too.
4. Push branch → GitHub PR → CI and review → merge → approved deployment on Hetzner. The application repository is the source of truth.
5. Deploy only approved full commit SHA to Hetzner **88.99.81.51**, directory **/opt/popestiri**, production Compose **compose.production.yaml**, domain **popestiri.aiexperiments.eu**. The **numeric Hetzner Cloud server ID is NOT VERIFIED**; do not invent one.
6. After deploy, verify HTTP /ready, DB migrations, image SHA, timer, logs and affected feature. Then submit a **separate post-deploy GitHub status PR** documenting the actual live version and tests; sync docs back onto the server using Git checkout of the documented release.
7. End every session by updating PROJECT_STATUS Next action so another AI session can resume without memory.

## Safety
- Server shares Docker/network with other projects. Do not alter unrelated services or volumes; never docker compose down -v or broad prune/reboot.
- Never print .env.production, passwords, API keys, private SSH keys or tokens.
- Do not alter applied migrations; obtain a backup before migrations, verify recovery independently.
- Paid API calls require explicit approval, bounded budgets; semantic pilot preview is read-only.
- TikTok Research API academic use is isolated; no academic research data into editorial system without separately verified permission. TikTok/Instagram/Facebook planned adapters are not active without access.
- Never fabricate metrics, evidence, quotes, transcripts, source independence, AI accuracy, or editorial verdicts.
- Distinguish PLANNED, CODED, MERGED, DEPLOYED, LIVE VERIFIED.

## Handover
Provide at the end of each task: actual files changed, tests run, PR/commit, deployment status, user action needed, and exact next step. Keep project docs synchronized on every functional PR; do not rely on chat memory.