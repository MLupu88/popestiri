## PopeȘtiri PR checklist

**Milestone / roadmap ID:**

**Change:** 

**Acceptance criteria:** 

**Validation evidence (do not claim tests not run):**
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] Feature-specific tests
- [ ] Additive migrations and compatibility reviewed (if applicable)

**MANDATORY for every functional PR — enforced by CI**
- [ ] `docs/roadmap.md` updated with milestone status, scope and next step
- [ ] `docs/PROJECT_STATUS.md` updated with actual CODED/MERGED/DEPLOYED/LIVE VERIFIED distinctions
- [ ] `docs/CHANGELOG.md` dated entry including changes and tests
- [ ] `docs/SERVER_RUNBOOK.md` updated if infrastructure/deploy changes

**Safety**
- [ ] No secrets or credentials
- [ ] Provider quotas/costs and legal data rights addressed
- [ ] No non-PopeȘtiri stack effects
- [ ] No claim that merged code is deployed

**Deployment (after merge, separate procedure):**
- Planned server SHA:
- Database migration/backup requirements:
- Live verification steps:
- Post-deploy status PR owner:
