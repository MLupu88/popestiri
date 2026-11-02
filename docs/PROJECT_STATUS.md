# PopeȘtiri — PROJECT STATUS / START HERE

**Audit static:** 2026-11-02 | **Sursa oficială:** GitHub main | **Actualizări obligatorii:** [roadmap.md](roadmap.md) + acest fișier + [CHANGELOG.md](CHANGELOG.md) în fiecare PR funcțional.

## NEXT P0 — P0-S3 observed 20-video preview + fix for rhetorical false positive (2026-11-02)

- Last operator output from built image `984f1ec` (one-shot only, **NO deploy**): 240 videos scanned, 117 preflight-usable descriptions, 20 sampled, 1 candidate statement. That one was the hypothetical/rhetorical question attributed to Gigi Becali: `Dacă n-are 2-3 mii o rochie, ce bărbat e ăla?`. So **0 convincing factual claims** in this sample; the previous 1 was an editorial false positive. A Dune trailer description also passed text-length preflight. No YouTube quota, DeepSeek calls or database writes.
- Fix **CODED / CI pending** in `packages/claims/youtube-description-preview.ts` + regression tests: description-specific exclusion of question marks, hypothetical/conditional and opinion-language, plus `low_signal_video_format` for generic broadcasts and entertainment. New count `nonFactualAssertionsSuppressed`; this is conservative but not a full semantic model.
- **NEXT:** verify CI, merge only if green, then build updated image without recreating live API or restarting DB and rerun read-only `node apps/worker/youtube-description-preview.ts --limit=20`. Expect 0 or another small number of claims; inspect any remaining examples for primary evidence and eligibility.
- Need a separate provider/rights feasibility evaluation for actual TikTok/YouTube/Facebook speech/transcripts, plus measured social propagation, before autonomous fact checking can be evaluated.

## NEXT P0 — YouTube description claims preview (2026-11-02)

- Last live operator command: `b3c6a` one-shot read-only Social Discovery gave `seedCount=120`, `groundedClaimSeedCount=0`, `queryCount=0`, `no_grounded_youtube_claims`. Correct, but still no social statement content. Live API image last confirmed `ae489a4`; new images built/run in isolated `docker compose run`, NOT deployed as API.
- **CODED / CI/merge/deploy/live pending:** `apps/worker/youtube-description-preview.ts`, `packages/claims/youtube-description-preview.ts`, `tests/youtube-description-preview.test.ts`, `pnpm youtube:description-preview`.
- Pilot reads **only YouTube Data API description metadata already present**; no video transcription, no paid calls, no provider requests or DB writes, max 240 scanned and 20 returned. Validated candidate assertions must have verbatim excerpt in the description (`summary`) and pass existing semantic source-grounding. Excludes title-only assertions; untrusted/promo/missing descriptions are held. Testability != truth or virality.
- **NEXT ACTION:** CI and review feature PR; on merged SHA build isolated tagged image without restarting API/DB, run `node apps/worker/youtube-description-preview.ts --limit=20` with `APP_VERSION` override and evaluate actual descriptions. Result may legitimately contain 0 testable assertions. Then rights-compliant transcript/caption provider and social metrics; TikTok/Facebook remain `unavailable`.

## LIVE QUALITY FINDING — P0-S2 YouTube title selection (2026-11-02)

- Operator ran **read-only social preview** with image `8f5709a`, `seedCount=120`, `queryCount=2`; selected an old-stone-in-Buzău human-interest title and a Becali TV headline. These are **unverified YouTube titles, not extracted checkable claims**. This confirms the code path runs, but the result is editorially poor.
- Current deployed API last verified `ae489a4`. `8f5709a` was built and tested as isolated one-shot image only; not deployed. YouTube provider marked `ready_to_probe`, TikTok/Facebook `unavailable`. No API probe, no DB writes.
- **CODED, CI PENDING:** repair planner so only `youtube_claim` grounded existing assertions generate searches; raw titles reported separately, `no_grounded_youtube_claims` yields 0 rather than invented relevance or wasted quota. 0 queries is a blocker to next stage, not a successful viral-discovery milestone.
- **Next:** CI of corrective PR, merge, test isolated read-only preview, then implement lawful social content text/extraction and coverage diagnostics; TikTok/Facebook access remains a separate licensing decision. Never promote metadata-based seed to unsupported fact-check.

## P0-S1/S2 — Social-first discovery planner (CODED; CI/merge/deploy pending, 2026-11-02)

- **New code:** `packages/discovery/social-query-planner.ts` / `apps/worker/social-discovery-preview.ts`; command `pnpm social:preview`. It selects at most two deterministic YouTube search hints from public YouTube video titles and existing testable claims with YouTube references from the last 7 days, never from bulk RSS headlines.
- **Preview is read-only:** DB SELECT only, no external requests or writes. Prints query traceability and source coverage. TikTok/Facebook remain `unavailable`; YouTube `ready_to_probe` only if enabled + key present. A separate explicit `--probe-youtube` flag may call the existing official API within the previous bounded adapter contract; no data persisted.
- **No service, migration, scheduler, external provider or automatic publishing activated.** This is *the first functional slice of social discovery*, not TikTok/Facebook ingestion or a verdict.
- **Tests added** for planner limits, filtering, deduplication, sources/unavailable states and preview boundaries. CI and live preview not yet observed; deploy must follow review + merged approved SHA.
- **Next:** GitHub PR CI; then approved deploy/review read-only social preview; separately investigate licensed TikTok/Facebook editorial provider and implement claim/evidence pipeline with abstention policy. See [SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md](SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md).

## PRODUCT DIRECTION UPDATED — social-first, autonomous fact checking (2026-11-02)

- **Owner request:** TikTok / Facebook / YouTube sunt prioritare pentru descoperire și măsurarea recirculării afirmațiilor. RSS rămâne sursă secundară de context și dovezi; accesul TikTok/Meta editorial **nu este încă implementat**. YouTube API este singura sursă socială live observată; nu există acces universal la postări, audio sau transcript.
- **Nu mai presupunem aprobarea manuală pentru fiecare caz.** Target: motor de dovezi + gate automat cu publicare justificată, `hold_for_exception` / `no_verdict` în situații insuficiente, audit/correctii și shadow-mode de test înainte de publicare automată. O simplă apreciere LLM a „încrederii” nu este suficientă.
- **Status REAL:** repo main la `e87df4c`, imagine construită și pilot `--preview --limit=20` complet: 20 cazuri, 3 testable, 13 uncertain, 3 ordinary, 1 entertainment, 0 paid calls; **nu s-a demonstrat deploy API `e87df4c` sau vreun verdict**. Claim Radar queue fix `ae489a4` funcțional în producție. Pilotul este doar detecție, nu verificare factuală.
- **NEXT P0:** proiectarea și implementarea P0-S1/S2 (surse sociale autorizate, query-planner YouTube, strat de adaptoare TikTok/Facebook care raportează `unavailable` până la drepturi), apoi evidence engine și gate autonom. Nu activa automat publish înainte de validare pe gold set.
- **Document de referință:** [SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md](SOCIAL_FIRST_AUTONOMOUS_FACTCHECK_2026-11-02.md).

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