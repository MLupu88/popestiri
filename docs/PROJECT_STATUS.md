# PopeȘtiri — PROJECT STATUS / START HERE

**Audit static:** 2026-11-02 | **Sursa oficială:** GitHub main | **Actualizări obligatorii:** [roadmap.md](roadmap.md) + acest fișier + [CHANGELOG.md](CHANGELOG.md) în fiecare PR funcțional.

## CURRENT BLOCKER — R0.2 SEMANTIC PREVIEW, 2026-11-02 14:39 UTC

### R0.2 diagnostic — semantic preview crashes on numeric grounding (2026-11-02 14:39 UTC)

- Production operator executed zero-paid `node apps/worker/claim-pilot.ts --preview --limit=20` on release image `ae489a4`. Process **crashed before report** in `validateSemanticAssertion` (`packages/claims/extractor.ts:199`), error `DeepSeek semantic numeric assertion is not present in the candidate content`. This preview did **not** contain `--paid` or `--apply`; no paid calls authorized and no pilot report was generated.
- Reproduction from static source: old `numberSignature` regex `/\\b\\d[\\d\\s.,]*\\b/g` admits whitespace between unrelated numeric tokens. SQL title+summary concatenation can consequently turn adjacent `12` and `2027` into nonexistent `122027`, producing a false numeric-grounding rejection. **Exact live candidate not identified yet**; treat this as a confirmed defect in parser logic, plausible explanation of crash rather than proven sole production input.
- Proposed patch **PR #19 MERGED, DEPLOY PENDING**: tokenize numeric segments independently (no inter-number whitespace concatenation); do not relax absent-number rejection. In the deterministic preview path, if grounding rejects an assertion, return a source-grounded deterministic fallback with diagnostics (possibly a valid testable assertion) and continue with the remaining sample. DeepSeek-sourced claims still require validation.
- Added regression tests for number boundaries and rejected deterministic assertions; keep `--preview` read-only, paid zero. Once checks pass, merge and deploy controlled; rerun 20-sample before judging true claim recall or proposing new providers.
- This PR #18 records earlier Claim Radar recovery and reconciles documentation with merged PR #19; keep the two fixes distinct.
## FUNCTIONAL VALIDATION — Claim Radar (2026-11-02 14:27:36 UTC)

- **Fix verified in production**: release image `popestiri-app:ae489a489139b92c90686fbf6f0b15d2ea926dc2` (PR #16, merged & deployed); 2 controlled one-shot RSS/discovery worker cycles after deploy, timer resumed and active.
- First run (14:24:56 UTC): `candidates=250, leads=0, failed=0`; all 250 pre-existing falsely stale checkpoints became **up-to-date**, stale `250 -> 0`. At that snapshot total candidates `8211`, never processed `7961`, up-to-date `250`.
- Second run (14:27:36 UTC): `candidates=250, leads=250, failed=0, complete=false`, confirming queue advances. DB: `total_candidates=8211`, `never_processed=7711`, `stale=0`, `up_to_date=500`. 250 fewer never processed than the first post-deploy snapshot. The original 7,922 pre-deploy never-processed count grew to 7,961 because 39 additional discovery records arrived before first post-deploy sample.
- **Remaining editorial blocker:** among 500 `claim_leads`, deterministic_v1 labels: `uncertain=414`, `ordinary_news_event=84`, `entertainment=2`, `testable_claim=0`. This does **not** prove there are zero true checkable claims in source articles. Need manually labeled representative sample and compare extraction/preview before choosing rules vs DeepSeek changes.
- **NEXT:** keep hourly timer active; the first 20-case preview on ae489a4 crashed with numeric grounding. PR #19 is merged but not deployed. Deploy it in a controlled release and rerun zero-paid `--preview --limit=20`, then create a manually labeled gold set. Keep infrastructure and semantic extraction quality as distinct milestones.
- **Documentation release caveat:** docs PR generated after release; after merge Git docs may move ahead of the running image SHA. Sync checkout docs safely without recreating application; `APP_VERSION` remains pinned to the deployed ae489a4 image.

## ULTIMUL DEPLOY OBSERVAT — 2026-11-02 14:19 UTC
- **MERGED:** PR #16 CI și docs continuity PASSED; merge commit `ae489a489139b92c90686fbf6f0b15d2ea926dc2`.
- **DEPLOYED / INFRA LIVE VERIFIED de operator:** checkout `ae489a4`; imagine rulată `popestiri-app:ae489a489139b92c90686fbf6f0b15d2ea926dc2`; container API healthy, PostgreSQL healthy și neatins, `/ready` = `{"status":"ok","databaseChecked":true}`, timer RSS repornit/activ. Nicio migrare nouă.
- **Backup DB:** `/root/backups/popestiri/popestiri_20261102T140956Z.dump` (4,5 MB) cu `pg_restore -l` validat; restaurare completă neefectuată. Copia configurației a fost creată în directorul backup înainte de upgrade.
- **Discul:** înainte de curățenie 84% (12 GB liberi), după `docker builder prune --force --filter 'until=168h'` 64% (27 GB liberi), Docker a raportat 16,71 GB cache eliminat. Nu au fost rulate volume/image/system prune; celelalte aplicații nu au fost vizate de comenzi.
- **NOTĂ ISTORICĂ:** la 14:19 UTC validarea logicii era încă pending; **14:27:36 UTC validarea s-a încheiat cu succes** (vezi secțiunea FUNCTIONAL VALIDATION de mai sus).
- **Nu activa DeepSeek plătit**, nu executa backlog nelimitat, nu presupune că zero `testable_claim` s-a remediat odată cu problema timestampurilor.

## Unde am rămas? — LIVE AUDIT 2026-11-02
- **Scop:** descoperire AUTOMATĂ de afirmații virale → dovezi → debunking → PDF/print, nu agregator sau community submissions.
- **Versiuni istorice 13:18 UTC:** Git/docs `878d81b`, API `e181e33`. **Versiunea curentă 14:19 UTC:** Git checkout și API `ae489a4` (PR #16), confirmată live de operator.
- **LIVE VERIFIED 2026-11-02:** API și DB healthy, `/ready` = `{"status":"ok","databaseChecked":true}`, timer RSS active. Datele de discovery sunt reale și recente; nu deduce succesul editorial din health.
- **SURSE:** 8.172 `discovery_candidates`, dintre care 483 observate în 24h și 2.687 în 7 zile. Digi24 2.619, G4Media 2.571, HotNews 1.912, YouTube 1.069, Google Trends 1. Ultimele 10 rulari discovery 04:00–13:00 UTC sunt `succeeded`.
- **BLOCAJ P0:** `claim_leads` are NUMAI 250 rânduri, 0 observate în ultimele 7 zile, 0 `testable_claim`; distribuție: `uncertain` 210, `ordinary_news_event` 38, `entertainment` 2. Toate `deterministic_v1`. Nu susține un radar de debunking real. **Cauză încă NECONFIRMATĂ**; batch size 250 în cod este doar indiciu.
- **Google Trends:** numai un candidat observat. Verifică adaptorul și logurile separat, nu presupune cauza.
- **Audit detaliat și query-uri diagnostic:** [LIVE_AUDIT_2026-11-02.md](LIVE_AUDIT_2026-11-02.md).
- **CI PR #14:** ambele check-uri PASSED; docs sincronizate; fixture-ul temporal al testului discovery a fost corectat fără schimbare de runtime.
- **Nu există:** Tavily/evidence-to-verdict end-to-end, fact-check public pages, PDF renderer, print agent. DeepSeek auto pilot rămâne dezactivat la ultima configurare verificată (2026-10-13); testul real pe 20 încă neprimit.
- **TikTok Research:** status necunoscut, inbox ASE neinspectat, date academice izolate de editorial. Instagram/Facebook fără automatic discovery activ.

## Server — date cunoscute (fără secrete)

| Câmp | Valoare |
|---|---|
| Provider | Hetzner |
| Public IPv4 | **88.99.81.51** |
| Hostname observat | `ubuntu-4gb-fsn1-1` |
| ID numeric server în consola Hetzner | **NECONFIRMAT** (nu confunda cu IP) |
| Director checkout | `/opt/popestiri` |
| Domeniu | `https://popestiri.aiexperiments.eu` |
| Compose | `compose.production.yaml` |
| Service API | `popestiri-production-api-1`, container port `3100` |
| DB | `popestiri-production-db-1`, Postgres 18 |
| NPM upstream | `popestiri-api:3100` via network `n8n_network` |
| Timer RSS | `popestiri-rss-ingest.timer` (systemd host-level) |
| Secret config | `/opt/popestiri/.env.production` (niciodată afișat/copiat în repo) |

## CI / PR #14 — FINAL
2026-11-02: PR #14 MERGED, checks CI test + Project docs continuity PASSED; corecție exclusiv fixture temporal în discovery tests; docs sincronizate pe Hetzner, imaginea API nu a fost schimbată.

## DIAGNOSTIC CONFIRMAT: timestamp precision starvation (2026-11-02)

- **7.922/8.172 never processed; 250/250 state entries show positive <1 ms mismatch** between `discovery_candidates.updated_at` and `claim_radar_candidate_state.last_candidate_updated_at` (mean 0.4758 ms). Last 6 worker runs: exactly 250 candidates and zero leads/failed each time. Mechanism: PostgreSQL timestamptz microseconds truncated via pg JavaScript Date millisecond resolution.
- Fix **MERGED + DEPLOYED + FUNCTIONALLY VERIFIED** la SHA `ae489a4`: timestamp `c.updated_at::text AS updated_at` la checkpoint; CI pass; queue advances in production as of 14:27 UTC. Fără migrări.
- [Production evidence](LIVE_AUDIT_2026-11-02.md).

## Next action (P0)

1. **Production queue progression FIX VERIFIED.** Nu mai porni workerul manual doar pentru verificarea timestampului; lasă timerul orar activ și urmărește backlog/failures în următoarele cicluri. Pre-deploy 7.922 never processed; after first run 7.961, second 7.711, `stale=0`.
2. **R0.2/quality evaluation P0**: previewul pe ae489a4 a eșuat la validare numerică; PR #19 cu fix și CI verde este MERGED dar NOT DEPLOYED. După deploy controlat rulează din nou preview pe 20 candidați, reprezentativ RSS/YouTube, fără `--apply`, `--paid`, sau costuri. Analizează manual textul titlului, rezumatul, verificabilitatea, clasificarea și relevanța editorială; definește un gold set și criterii reproducibile.
3. **Nu presupune că zero testable_claim reprezintă adevărul.** Poate fi low-recall/poor input quality; e nevoie de sample și etichete. Abia apoi propune schimbări de extractor/semantic pilot și teste prin PR cu docs.
4. Google Trends are 1 singur candidat și necesită diagnostic separat; continuă R1 query planner/R2 evidence numai după evaluarea detecției.
5. După merge PR docs, sincronizează checkoutul pe Hetzner fără rebuild/restart; `APP_VERSION` rămâne `ae489a4` dacă PR-ul este doar documentație.

## Stare milestone

| ID | Stare | Următor pas |
|---|---|---|
| M0.1–M0.3C.1.1 | LIVE VERIFIED partial | 8.172 discovery, 10 runs succeeded, Google Trends 1 candidat |
| M0.3C.2A | MERGED + DEPLOYED + FUNCTIONALLY VERIFIED | 14:27 UTC: 500 processed, stale 0, never 7.711, 250 leads in latest run, 0 failures; editorial quality remains unverified |
| M0.3C.2A.1 | CODE IMPLEMENTED / PILOT NOT EVALUATED | preview 20 |
| R1 Viral Discovery | TODO | query planner |
| R2 Evidence/Tavily | TODO | evidence connector |
| R3 Public case/editorial | TODO | vertical slice |
| R4 PDF/Epson | TODO | prototype + physical QA |
| R5 Daily autonomous edition | TODO | scheduler separat |

## History / handover

**2026-11-02:** PR #14 integrat; documentația sincronizată pe server; /ready și timer active, 8.172 candidați discovery, 250 claim leads vechi. Auditul rămâne deschis la cauza blocajului Claim Radar.

**La începutul oricărei sesiuni noi:** citește [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), acest status, [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md), [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md), [CHANGELOG.md](CHANGELOG.md), [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md). Verifică GitHub și, dacă faci deploy, serverul. Distinge întotdeauna PLANNED / CODED / MERGED / DEPLOYED / LIVE VERIFIED. Actualizează cele 3 fișiere în orice PR funcțional și statusul după fiecare deploy.