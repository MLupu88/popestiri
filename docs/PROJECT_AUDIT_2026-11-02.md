# PopeȘtiri — AUDIT (2026-11-02)

**Tip audit:** GitHub static + loguri operator din 2026-10-13. **NU** s-a executat o inspecție live Hetzner la 2026-11-02.
**GitHub HEAD observat:** e181e3329c5ba4498478b501e9ef6d8d4a8261ce; PR #1–13 merged.

## Dovezi și rezultate

| Componentă | Dovadă în cod | Stare verificată |
|---|---|---|
| Node API, autentificare admin, CSS | apps/web/server.ts, auth.ts, views.ts | cod prezent; /health public 200 la 13 Oct |
| Postgres + migrări | compose.production.yaml, migrations 0001–0010 | 10 migrări confirmate în DB la 13 Oct |
| RSS + scheduler | worker/ingest.ts, systemd runbook | timer activ la 13 Oct; loguri live curente necunoscute |
| Trends RO / YouTube | discovery adapters, service, docs/discovery.md | cod prezent; cheia YouTube și success rate live necunoscute |
| Inbox + dedup | discovery/service.ts, PR #9 | grupare lexicală provizorie, nu semantică |
| Claim Radar | claims extraction, admin claims, PR #10 | cod prezent, fără viral ranking și verdict |
| Semantic pilot | PR #11–13, migrare 0008–0010 | cod/teste; DeepSeek off și max=0 la 13 Oct; preview 20 fără rezultat confirmat |
| TikTok / Meta | social-adapters.ts contract_only | fără integrare live; status TikTok Research necunoscut |
| Tavily + research | connector interface și tabele fundamentale | **NU** există motor complet de verificare |
| Pagini publice de fact-check | server.ts | **NU** există ruta publică de dosar |
| PDF/print | print-spec.md, contracte SQL | fără renderer real sau print agent demonstrat |
| Daily edition | contracte stage/edition, timer RSS | timerul RSS NU produce ediția zilnică |
| CI | .github/workflows/ci.yml | typecheck + teste; inițial fără continuity guard |

## Gap-uri critice

**G1 P0:** Nu avem metrici de calitate ale extracției semantice; preview-ul pe 20 candidați a rămas neconfirmat. Construiește gold-set și evaluare manuală.

**G2 P0:** RSS și Trends găsesc știri/subiecte; produsul țintă trebuie să găsească și prioritizeze *afirmații virale*. Lipsesc claim-based query planner, metrici de răspândire coerente și explicația priorității.

**G3 P0:** Evidențe/verdicte/pagini publice nu sunt integrate. Nu confunda schema SQL cu feature runtime.

**G4 P1:** PDF, media rights și tipărire Epson L5390 lipsesc; spec menționează duplex, dar imprimanta a fost observată tipărind simplex.

**G5 P0:** Documentația de octombrie era parțial depășită și nu exista handover obligatoriu pentru Codex/Claude Code. Acest PR adaugă PROJECT_STATUS, roadmap actualizat, working agreement, server runbook, changelog și CI guard.

**G6 P1:** TikTok Research status neconfirmat; Claude Browser 2 Nov nu a găsit proiect în contul ASE și nici email în Gmail personal. Inboxul academic nu a fost căutat. Research academic nu devine licență pentru utilizare editorială.

**G7 P1:** Backup PG listat la 13 Oct (~733 KB); nu este dovadă de restaurare funcțională. Server partajat; atenție la volume/rețea/servicii.

## Dovezi verificate pe GitHub

- PR #1–#3: admin, RSS, scheduler.
- PR #4–#6: social intake manual.
- PR #7–#9: discovery auto + inbox/topic grouping.
- PR #10: claim radar.
- PR #11–#13: semantic pilot/hardening.
- package.json: Node >=24, pnpm, typecheck/tests; CI GitHub Actions.
- docs/architecture.md, docs/discovery.md, docs/claim-radar.md, docs/print-spec.md, docs/social-discovery-feasibility.md.

## De confirmat prin audit live separat

HEAD Git/server, Docker image ID, /ready, migrații actuale, timer/service/logurile ultimelor 24 h, număr candidați/leaduri și distribuția pe surse, starea YouTube (boolean, nu cheia), starea pilotului și ID numeric din consola Hetzner dacă este util.

**Decizii:** GitHub main = sursa de adevăr; schimbări funcționale → roadmap/status/changelog în același PR, verificare CI; server docs sincronizate prin checkout Git; status CODED/MERGED/DEPLOYED/LIVE VERIFIED separat.