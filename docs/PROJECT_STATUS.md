# PopeȘtiri — PROJECT STATUS / START HERE

**Audit static:** 2026-11-02 | **Sursa oficială:** GitHub main | **Actualizări obligatorii:** [roadmap.md](roadmap.md) + acest fișier + [CHANGELOG.md](CHANGELOG.md) în fiecare PR funcțional.

## Unde am rămas? — LIVE AUDIT 2026-11-02
- **Scop:** descoperire AUTOMATĂ de afirmații virale → dovezi → debunking → PDF/print, nu agregator sau community submissions.
- **GitHub main și checkout Hetzner:** `878d81b3eeae8305ff06870e8ac49028cf6b17b9` (PR #14 merged, 2 Nov); **API Docker live și APP_VERSION:** `e181e3329c5ba4498478b501e9ef6d8d4a8261ce` — diferență intenționată, fără rebuild la sincronizarea docs.
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

## Next action (P0)

1. **P0: Diagnostic read-only Claim Radar** pe Hetzner cu SQL din [LIVE_AUDIT_2026-11-02.md](LIVE_AUDIT_2026-11-02.md): numărul candidaților neprocesați, starea `claim_radar_candidate_state`, checkpoint, `audit_events.after_value->'claimRadar'` pentru ultimele rulari. Nu schimba cod, batch size, SQL sau cron înainte de diagnostic.
2. Investighează Google Trends `adapter_results` / erori doar dacă sunt sanitizate.
3. Execută pilotul deterministic `--preview --limit=20` fără paid calls; colectează raportul și etichetează cazurile.
3. Fă gold set / metrici; abia apoi calibrare DeepSeek.
4. Construiește R1 claim-based query planner + auto social/public-index permitted + ranking explicabil.
5. Construiește R2 Tavily/evidence și primul debunking validat.
6. R3 pagină publică; R4 PDF/print; R5 autonomie zilnică.

## Stare milestone

| ID | Stare | Următor pas |
|---|---|---|
| M0.1–M0.3C.1.1 | LIVE VERIFIED partial | 8.172 discovery, 10 runs succeeded, Google Trends 1 candidat |
| M0.3C.2A | CODE IMPLEMENTED / LIVE BLOCKED | 250 leads, 0 noi în 7 zile; diagnostic queue/state/run logs |
| M0.3C.2A.1 | CODE IMPLEMENTED / PILOT NOT EVALUATED | preview 20 |
| R1 Viral Discovery | TODO | query planner |
| R2 Evidence/Tavily | TODO | evidence connector |
| R3 Public case/editorial | TODO | vertical slice |
| R4 PDF/Epson | TODO | prototype + physical QA |
| R5 Daily autonomous edition | TODO | scheduler separat |

## History / handover

**2026-11-02:** PR #14 integrat; documentația sincronizată pe server; /ready și timer active, 8.172 candidați discovery, 250 claim leads vechi. Auditul rămâne deschis la cauza blocajului Claim Radar.

**La începutul oricărei sesiuni noi:** citește [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), acest status, [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md), [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md), [CHANGELOG.md](CHANGELOG.md), [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md). Verifică GitHub și, dacă faci deploy, serverul. Distinge întotdeauna PLANNED / CODED / MERGED / DEPLOYED / LIVE VERIFIED. Actualizează cele 3 fișiere în orice PR funcțional și statusul după fiecare deploy.