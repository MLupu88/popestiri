# PopeȘtiri — CHANGELOG / DECISION LOG

**Regulă:** istoric append-only. Pentru orice schimbare funcțională, actualizează acest jurnal + [roadmap.md](roadmap.md) + [PROJECT_STATUS.md](PROJECT_STATUS.md) în același PR. Fiecare intrare conține data, milestone, motiv, PR/SHA, teste, deploy și follow-up; nimic nu se declară „deployed” fără dovadă.

## 2026-11-02 — P0-S3 live 20-description finding: numeric rhetorical question misclassified (corrective PR)

- Production-data read-only operator pilot built from `984f1ec`: 240 scanned, 117 description preflight-usable, 20 previewed, 1 testable assertion claimed. The case was `Dacă n-are 2-3 mii o rochie, ce bărbat e ăla?` attributed in a B1 TV description. This is a rhetorical conditional question, **not factual evidence/claim**. Dune trailer description also passed old length-only preflight.
- New conservative local description filter **CODED, CI pending**: suppress conditional questions/opinions, low-signal entertainment and generic broadcast metadata; metrics/diagnostics report suppression; regression tests on the actual observed false positive and a valid numeric declarative positive case. `truthfulness` remains `unassessed` and there is no inference of spoken content.
- No API deployment, data changes, provider calls, transcript retrieval, migrations, timer or public publishing. Next: CI and merged image read-only preview against existing data; then design rights-compliant social speech retrieval and source/evidence engine.

## 2026-11-02 — P0-S3 YouTube description claim extraction preview (feature PR; not deployed)

- Operator's live read-only Social Discovery preview on built image `b3c6a`: `rawVideoTitleCount=120`, `groundedClaimSeedCount=0`, `queryCount=0`. Zero is the correct protection against title-based noise; it is **not** an operational viral discovery success.
- CODED (CI/merge pending) zero-paid metadata-only YouTube description pilot: source and excerpt grounding, title-only suppression, untrusted-text gate, bounded scan/sample, read-only DB. Adds CLI and focused tests.
- No transcriptions, media fetching, external provider requests, DB modifications, migrations or app deploy. A testable description statement is not automatically a video quote, viral item, or false statement.
- Next: CI/PR merge, run isolated preview against existing production records, examine real metadata utility; continue licensed social access and true evidence verification.

## 2026-11-02 — Social Discovery preview succeeds but quality gate fails (corrective PR)

- Production data read-only preview from built image `8f5709a`: 120 YouTube seeds, 2 queries chosen from irrelevant public video titles; YouTube ready-to-probe; TikTok/Facebook unavailable. No provider requests/writes occurred.
- Problem: freshness-filtered title-only seed != grounded public assertion. Proceeding would waste quota and could misleadingly imply viral misinformation identified.
- Fix **CODED, CI/PR pending:** accept only extracted source-grounded YouTube claim leads for search. When none: 0 queries + explicit `no_grounded_youtube_claims`; preserve raw title count as diagnostic, do not call APIs by default. Two concrete bad titles added as regression tests.
- No migrations, scheduler change, API activation or paid resources. Next: CI, review/merge, run another read-only preview; build actual social claim extraction, not title-based keyword expansion.

## 2026-11-02 — P0-S1/S2 first social-first functional slice (feature PR)

- Implementation branch creates `social-query-planner.ts` plus read-only CLI `social-discovery-preview.ts`, new `pnpm social:preview` and tests. Limits: up to two official YouTube search hints chosen from recent YouTube material only; reasons/provenance included; no RSS seed; no viral/falsity inference.
- `--preview` makes only database SELECT and does not call any provider. `--probe-youtube` is separate explicit API/quota opt-in using existing official adapter and no DB write; not enabled in the hourly scheduler.
- TikTok/Facebook `unavailable` (no licensed editorial access). No paid API calls, schema migrations, runtime release or public publishing. **CODED / PR and CI pending**; test cases added, outcome pending.
- Next: CI + review, merge, controlled preview on Hetzner and measure whether query quality/coverage merits enabling targeted discovery. Product goal remains autonomous evidence-gated debunking, not manual per-story approval.

## 2026-11-02 — Owner changed product direction: SOCIAL-FIRST and autonomous evidence-gated publication (docs-only PR)
- Prioritatea editorială devine TikTok, Facebook și YouTube, nu volumul RSS; presa rămâne instrument de context și identificare a surselor primare. Un trending topic nu este echivalent cu dezinformarea.
- Se elimină aprobarea umană obligatorie pentru fiecare articol ca obiectiv de produs. Înlocuire planificată cu `auto_publish` numai când sunt îndeplinite gate-uri reproductibile de dovezi, drepturi și risc; `hold_for_exception` / `no_verdict` când cazul nu poate fi dovedit. Human spot-check în shadow testing pentru validarea sistemului, nu workflow zilnic obligatoriu.
- TikTok/Meta editorial **nu au integrare verificată**; TikTok Research academic nu poate fi reutilizat fără drepturi explicite. YouTube API este singura sursă socială automatizată observată. PR documentație, **niciun cod/API activat și niciun deploy**.
- Pilot semantic 20/20 pe imaginea construită `e87df4c`: 3 testable, 13 uncertain, 3 ordinary news, 1 entertainment, 0 apeluri plătite, fără verificare independentă. `e87df4c` nu a fost încă confirmat ca API deployed.
- New canonical design: [SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md](SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md). Next: P0-S1/S2 social authorized discovery, then Tavily/evidence engine, shadow-gated autonomous publishing.

## 2026-11-02 14:39 UTC — Fix semantic pilot numeric validation (PR #19 merged; deploy pending)
- Live preview `--preview --limit=20` on `ae489a4` crashed at `extractor.ts:199` with `DeepSeek semantic numeric assertion is not present in the candidate content`; no report, no paid/apply flags.
- Cause in parser: whitespace-containing numeric signature regex can conflate distinct numbers separated by a space at field boundaries, creating false numeric grounding failures. Live trigger candidate unknown; deterministic regression added.
- PR #19 MERGED (`e34f55a`), but NOT deployed: numeric tokens remain distinct and unsupported numbers are still rejected. Invalid deterministic proposals fall back to source-grounded deterministic extraction (which can yield a valid assertion), with diagnostics instead of aborting the preview. Regression tests passed; no DB migrations or paid provider change.
- Claim Radar queue fix `ae489a4` remains deployed and functionally verified. PR #18 reconciles its documentation with PR #19. Next: deploy PR #19 code via an approved release, rerun zero-paid 20-sample preview and review claim quality.

## 2026-11-02 14:27 UTC — Claim Radar queue progress verified live (post-deploy docs PR)
- Two controlled one-shot worker runs after PR #16 release `ae489a4`: first at 14:24:56 UTC `candidates=250,leads=0,failed=0`, state corrected to 250 up-to-date / 0 stale. Second at 14:27:36 UTC `candidates=250,leads=250,failed=0`, proving next batch progresses.
- DB second snapshot: 8.211 candidates, 500 up-to-date, 7.711 never processed, 0 stale, timer active. New discovery records accounted for increase from original 8.172 to 8.211; no evidence of lost data.
- **Engineering milestone: COMPLETE + VERIFIED ON PROD.** Editorial milestone: **BLOCKED ON QUALITY** — 500 leads: 414 uncertain, 84 ordinary_news_event, 2 entertainment, 0 testable_claim. No manual gold labels yet; cannot conclude the source really had no verifiable claims.
- No additional code, schema, or paid DeepSeek calls. Keep hourly timer; next R0.2 preview 20 + gold set, then analyze recall and Google Trends separately.

## 2026-11-02 14:19 UTC — Release ae489a4 deploy în producție (verificare funcțională PENDING)
- PR #16 integrat, SHA `ae489a489139b92c90686fbf6f0b15d2ea926dc2`, CI/typecheck și docs continuity PASS.
- Operatorul a verificat checkout la ae489a4, imagine Docker nouă built, API recreated doar `api` la SHA ae489a4 healthy, PostgreSQL healthy fără restart, `/ready` status ok/databaseChecked true, timer RSS repornit; nicio migrare nouă.
- DB backup verificat prin `pg_restore -l` la `/root/backups/popestiri/popestiri_20261102T140956Z.dump`, 4,5 MB; nu a fost efectuat restore test. Config backup local făcut înaintea updateului.
- Curățenie container build cache doar `docker builder prune --force --filter until=168h`: Docker 16,71 GB cache eliminat; disc 84% → 64% ocupare, 12 GB → 27 GB liberi. Nu s-au curățat volume sau imagini.
- **Mai lipsește:** demonstrația live că `claim_radar` avansează prin 7.922 candidați neprocesați; un singur worker smoke + SELECT read-only urmează. Nu declara remedierea validată funcțional.

## 2026-11-02 — Claim Radar timestamp precision repair (feature PR în curs)
- Dovezi read-only: 250/250 processate au diferență pozitivă sub 1 ms între updated_at și checkpoint (medie 0,4758 ms), 7.922 fără state; 6 cicluri worker cu 250 candidates / 0 leads.
- Fix de cod: selected `c.updated_at::text AS updated_at` în `packages/claims/service.ts` păstrează exact microsecundele PostgreSQL, evitând conversia la JS Date; nu schimbă schema sau datele din DB.
- Test regression adăugat pentru 6 cifre fracționare, batch size 1, drenarea cozii, zero rerulare și revalidarea cu conținut nemodificat.
- Status: **CODED**, verificare CI/PR/merge/deploy/prod pending, niciun restart sau apel plătit efectuat.

## 2026-11-02 — Live audit discovery + Claim Radar (PR de documentație în curs)
- Operator Hetzner a verificat 2 Nov: checkout Git/docs 878d81b, container API e181e33 healthy, DB healthy, /ready databaseChecked true, timer RSS active; fără modificare runtime.
- DB: 8.172 discovery candidates, 483 în 24h, 2.687 în 7 zile; 10 discovery runs succeeded; YouTube 1.069 candidați, Google Trends doar 1.
- **BLOCAJ P0:** 250 claim leads, 0 în ultimele 7 zile și 0 testable_claim. Cauza neconfirmată; diagnosticul state/backlog/audit_events este următorul pas. Fixul necesită PR separat după confirmarea cauzei.
- Documentul [LIVE_AUDIT_2026-11-02.md](LIVE_AUDIT_2026-11-02.md) păstrează dovezile, interogările și limitările. Nicio comandă cu scrieri DB sau API paid.

## 2026-11-02 — PR #14 MERGED / docs sincronizate
- CI test and Project docs continuity PASSED; merge SHA 878d81b, documente sincronizate pe Hetzner la 13:18 UTC, API image a rămas e181e33. Test discovery fixture timestamp fixat exclusiv în cod de test.

## 2026-11-02 — Corectare fixture de teste dependentă de dată (PR #14)
- CI inițial #14: 65/68 teste passed, 3 failed în tests/discovery.test.ts deoarece fixture-ul `candidate()` folosea 2026-10-11, în afara ferestrei `now() - interval '7 days'` la 2026-11-02.
- Modificat exclusiv fixture-ul `candidate()` să creeze date observate relativ la timpul rulării (24h în urmă), păstrând datele fixe doar în testele deliberate de distanțe temporale. NU se schimbă logica produsului și nu se fac migrări sau deploy.
- Rerularea CI finală a trecut, PR #14 integrat 2026-11-02.

## 2026-11-02 — Audit / proiect de continuitate (în PR, nu încă în main sau pe server)
- Audit static GitHub la HEAD `e181e33`, raport de evidență separat de ceea ce a fost observat în producție la 2026-10-13.
- Roadmap v2 realiniat la **automatic viral debunking**, fără dependență de community submissions.
- Propuneri de documentație: status, audit, working agreement, runbook Hetzner, instrucțiuni Codex/Claude Code și guard CI pentru roadmap/status/changelog.
- **Nicio acțiune efectuată pe Hetzner.** Acest PR cere review/merge înainte de sincronizarea checkoutului pe server.

## 2026-10-13 — PR #13 (merge `e181e3329c5ba4498478b501e9ef6d8d4a8261ce`)
- Semantic pilot: protecție polaritate RO, contorizare API usage unknown, origine extracție, migrare aditivă `0010`.
- Codex: typecheck, semantic 12/12, full 68/68; GitHub CI passed.
- Loguri operator: backup PostgreSQL 733 KB (lista pg_restore citibilă), build imagine, aplicare migrări 0008–0010, API la `e181e33` healthy, /health HTTP 200, DeepSeek automat dezactivat și max calls 0, timer RSS repornit.
- Pilotul de 20 de articole **nu are rezultat primit**; status PENDING.

## 2026-10-13 — PR #11–12
- Pilot semantic independent, aserțiuni multiple, preview/dry-run/apply, cache și limite de cost; migrări 0008–0009. PR #12 a fost integrat înainte de corecțiile finale reluate în PR #13.

## 2026-10-13 — PR #10
- Viral Claim Radar Foundation cu `claim_leads`, provenance, observații și admin `/admin/claims`.

## 2026-10-11 — PR #7–9
- Discovery automat: RSS, Google Trends RO, YouTube Data API opțional, inbox și grupare lexicală.

## 2026-10-10–11 — PR #1–6
- Admin, ingestie RSS, systemd timer, Social Intake manual, hardening și teste.