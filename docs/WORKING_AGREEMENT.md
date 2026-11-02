# PopeȘtiri — WAYS OF WORKING (MANDATORY)

Aceste reguli se aplică tuturor contributorilor: Codex, Claude Code, ChatGPT și oameni.

## La început de sesiune
1. Citește AGENTS.md / CLAUDE.md, docs/PROJECT_STATUS.md, docs/roadmap.md, docs/CHANGELOG.md și docs/SERVER_RUNBOOK.md.
2. Verifică origin/main, git status și commit HEAD. Nu te baza pe memoria vreunei sesiuni.
3. Alege următorul task P0 din roadmap sau taskul cerut; declară milestone, criterii de acceptare și riscuri.

## Flux obligatoriu
1. **Codex sau Claude Code** lucrează într-un branch nou pornit din ultimul origin/main, preferabil cu PR-uri mici și teste.
2. Rulează pnpm install --frozen-lockfile, pnpm typecheck, pnpm test și testele specifice schimbării.
3. Pentru ORICE PR funcțional, modifică în același PR:
   - docs/roadmap.md (milestone, progres, restanțe și următorul pas);
   - docs/PROJECT_STATUS.md (ce este CODED / MERGED / DEPLOYED / LIVE VERIFIED, testele, blocajele);
   - docs/CHANGELOG.md (data, motivul, PR, verificările și diferența față de producție).
4. Commit → push branch → PR pe GitHub → GitHub Actions CI + check Project docs continuity → review → merge. Nu modifica direct main.
5. **Doar după merge**, operatorul face deploy pe Hetzner, cu procedura docs/SERVER_RUNBOOK.md. Nu aplica migrații în orb și nu modifica celelalte proiecte.
6. **După deploy**, consemnează printr-un PR de status în GitHub SHA-ul instalat, verificările live și problemele, apoi sincronizează checkout-ul serverului. Merge nu înseamnă deployed; deployed nu înseamnă verified.
7. La final de sesiune lasă docs/PROJECT_STATUS.md cu **Next action** specific (comanda/fișierul/PR), nu un rezumat vag.

## Stări
- PLANNED: doar plan.
- CODED: implementat, posibil încă netestat/revizuit.
- MERGED: în main, CI trecut.
- DEPLOYED: SHA confirmat pe server.
- LIVE VERIFIED: probe de runtime documentate, cu dată.
- BLOCKED: dependență și fallback explicit.

## Interdicții
- Nu publica tokens, .env.production, DB passwords, private SSH keys.
- Nu modifica migrări deja aplicate; nu elimina volume.
- Nu activa servicii plătite fără acord pentru cost/limită.
- Nu folosi TikTok Research academic în editorial fără permisiuni explicite; fără scraping neautorizat.
- Nu inventa reach, surse, transcripturi sau verdicturi.
- Nu automatiza publicarea fără evidence policy/review sau print fără PDF validat.
- Nu atinge n8n, proxy, Postgres ori containerele altor proiecte de pe Hetzner.

## Ghid pentru agenți
Fiecare agent trebuie să lase în răspunsul final: ce a modificat, testele efectuate, documentele actualizate, branch/PR/commit, ce nu este deployed și next step exact.

GitHub este sursa unică. Hetzner 88.99.81.51, /opt/popestiri, primește numai release-uri aprobate; documentația merge în aceleași commituri. Verificarea automată a celor 3 docs poate fi ocolită prin direct push dacă branch protection nu este activată în repository.