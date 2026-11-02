# CLAUDE.md — PopeȘtiri

Read [AGENTS.md](AGENTS.md) first: it is the canonical instructions shared with Codex and Claude Code. All instructions there are mandatory.

Before any change, read:
- docs/PROJECT_STATUS.md
- docs/roadmap.md
- docs/WORKING_AGREEMENT.md
- docs/CHANGELOG.md
- docs/SERVER_RUNBOOK.md

Critical: every functional PR must update docs/roadmap.md, docs/PROJECT_STATUS.md, and docs/CHANGELOG.md in the same branch and PR, or CI fails. Do not claim changes are deployed until checked on Hetzner. No production modifications except an explicitly approved release process.

Project: Romanian **automatic viral claim debunking**, not news recaps or community submission reliance.
Hetzner: 88.99.81.51, project directory /opt/popestiri, domain https://popestiri.aiexperiments.eu; numeric Hetzner Cloud server ID unverified.

At session end write the actual next step in docs/PROJECT_STATUS.md; log changes in CHANGELOG and update roadmap milestones.

Read AGENTS.md for security, source licensing, cost controls, testing and production rules.