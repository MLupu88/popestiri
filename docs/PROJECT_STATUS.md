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

## DIAGNOSTIC CONFIRMAT: timestamp precision starvation (2026-11-02)

- **7.922/8.172 never processed; 250/250 state entries show positive <1 ms mismatch** between `discovery_candidates.updated_at` and `claim_radar_candidate_state.last_candidate_updated_at` (mean 0.4758 ms). Last 6 worker runs: exactly 250 candidates and zero leads/failed each time. Mechanism: PostgreSQL timestamptz microseconds truncated via pg JavaScript Date millisecond resolution.
- Fix **CODED, not merged/deployed** on branch `fix/claim-radar-timestamp-precision-20261102`: preserve original DB timestamp as `c.updated_at::text AS updated_at` before writing processing checkpoints; focused regression test for queue progression and refresh without re-extraction. NO migrations, NO server changes. CI status to confirm.
- [Production evidence](LIVE_AUDIT_2026-11-02.md).

## Next action (P0)

1. CI typecheck + test (including regression) și review pe PR-ul de fix pentru microsecunde. Nu merge dacă este roșu.
2. După merge, deploy controlat numai PopeȘtiri, fără modificări în alte stackuri. `APP_VERSION` trebuie să corespundă noului SHA, cu backup/verificări /ready și RSS.
3. După deploy, monitorizează două-trei rulări: rândurile `never_processed` trebuie să scadă, starea `falsely_stale` trebuie să dispară și `leads` să crească. Evită backfill nelimitat pe serverul partajat; nu activa DeepSeek plătit.
4. Actualizează roadmap/status/changelog prin PR post-deploy cu SHA și date reale; sincronizează docs pe Hetzner.
5. R0.2: semantic pilot deterministic pe 20 și gold set; apoi investighează separat Google Trends și continuă R1/R2.

## Stare milestone

| ID | Stare | Următor pas |
|---|---|---|
| M0.1–M0.3C.1.1 | LIVE VERIFIED partial | 8.172 discovery, 10 runs succeeded, Google Trends 1 candidat |
| M0.3C.2A | LIVE BLOCKED; FIX CODED / NOT DEPLOYED | microseconds truncation 250/250, 7.922 backlog; merge+deploy+validation pending |
| M0.3C.2A.1 | CODE IMPLEMENTED / PILOT NOT EVALUATED | preview 20 |
| R1 Viral Discovery | TODO | query planner |
| R2 Evidence/Tavily | TODO | evidence connector |
| R3 Public case/editorial | TODO | vertical slice |
| R4 PDF/Epson | TODO | prototype + physical QA |
| R5 Daily autonomous edition | TODO | scheduler separat |

## History / handover

**2026-11-02:** PR #14 integrat; documentația sincronizată pe server; /ready și timer active, 8.172 candidați discovery, 250 claim leads vechi. Auditul rămâne deschis la cauza blocajului Claim Radar.

**La începutul oricărei sesiuni noi:** citește [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), acest status, [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md), [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md), [CHANGELOG.md](CHANGELOG.md), [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md). Verifică GitHub și, dacă faci deploy, serverul. Distinge întotdeauna PLANNED / CODED / MERGED / DEPLOYED / LIVE VERIFIED. Actualizează cele 3 fișiere în orice PR funcțional și statusul după fiecare deploy.