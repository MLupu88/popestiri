# PopeȘtiri — PROJECT STATUS / START HERE

**Audit static:** 2026-11-02 | **Sursa oficială:** GitHub main | **Actualizări obligatorii:** [roadmap.md](roadmap.md) + acest fișier + [CHANGELOG.md](CHANGELOG.md) în fiecare PR funcțional.

## ULTIMUL DEPLOY OBSERVAT — 2026-11-02 14:19 UTC
- **MERGED:** PR #16 CI și docs continuity PASSED; merge commit `ae489a489139b92c90686fbf6f0b15d2ea926dc2`.
- **DEPLOYED / INFRA LIVE VERIFIED de operator:** checkout `ae489a4`; imagine rulată `popestiri-app:ae489a489139b92c90686fbf6f0b15d2ea926dc2`; container API healthy, PostgreSQL healthy și neatins, `/ready` = `{"status":"ok","databaseChecked":true}`, timer RSS repornit/activ. Nicio migrare nouă.
- **Backup DB:** `/root/backups/popestiri/popestiri_20261102T140956Z.dump` (4,5 MB) cu `pg_restore -l` validat; restaurare completă neefectuată. Copia configurației a fost creată în directorul backup înainte de upgrade.
- **Discul:** înainte de curățenie 84% (12 GB liberi), după `docker builder prune --force --filter 'until=168h'` 64% (27 GB liberi), Docker a raportat 16,71 GB cache eliminat. Nu au fost rulate volume/image/system prune; celelalte aplicații nu au fost vizate de comenzi.
- **IMPORTANT:** fixul de precizie este instalat, dar **nu a fost încă validată funcțional reducerea backlogului**. Ultima citire PRE-DEPLOY: 8.172 candidați, 7.922 never processed, 250 stale prin decalaj sub 1 ms, 250 leads. Următoarea acțiune: pornește UN SINGUR `popestiri-rss-ingest.service` în mod controlat, inspectează `claim_radar` audit și coada. Prima rulare poate doar curăța vechile 250 checkpointuri; următoarea trebuie să reducă `never_processed`.
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
- Fix **MERGED + DEPLOYED; FUNCTIONAL VALIDATION PENDING** la SHA `ae489a4`: păstrează timestampul ca `c.updated_at::text AS updated_at` la checkpoint, test de regresie trecut în GitHub CI. Fără migrări. Containerul nou healthy la 14:19 UTC.
- [Production evidence](LIVE_AUDIT_2026-11-02.md).

## Next action (P0)

1. **Verifică fixul în producție:** un singur `systemctl start popestiri-rss-ingest.service` când workerul nu e deja activ; verifică status + `audit_events.after_value->'claimRadar'` + `claim_radar_candidate_state`. Primul ciclu poate doar rectifica cele 250 state-uri vechi; confirmă apoi că `never_processed` scade pe cicluri ulterioare.
2. Dacă backlogul rămâne blocat, colectează dovezi read-only și investighează înainte de alte scrieri; evită fallbackuri distructive sau modificări de batch size ca ocolire.
3. Notează **LIVE VERIFIED funcțional** numai după cifre concrete în acest document/roadmap/changelog, prin PR; sincronizează serverul după merge.
4. După drain, rulează preview 20 fără costuri + gold set pentru a evalua calitatea clasificării, apoi diagnostic separat Google Trends și R1/R2.

## Stare milestone

| ID | Stare | Următor pas |
|---|---|---|
| M0.1–M0.3C.1.1 | LIVE VERIFIED partial | 8.172 discovery, 10 runs succeeded, Google Trends 1 candidat |
| M0.3C.2A | MERGED + DEPLOYED; FUNCTIONAL VERIFY PENDING | SHA ae489a4 healthy; worker/backlog not yet validated |
| M0.3C.2A.1 | CODE IMPLEMENTED / PILOT NOT EVALUATED | preview 20 |
| R1 Viral Discovery | TODO | query planner |
| R2 Evidence/Tavily | TODO | evidence connector |
| R3 Public case/editorial | TODO | vertical slice |
| R4 PDF/Epson | TODO | prototype + physical QA |
| R5 Daily autonomous edition | TODO | scheduler separat |

## History / handover

**2026-11-02:** PR #14 integrat; documentația sincronizată pe server; /ready și timer active, 8.172 candidați discovery, 250 claim leads vechi. Auditul rămâne deschis la cauza blocajului Claim Radar.

**La începutul oricărei sesiuni noi:** citește [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), acest status, [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md), [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md), [CHANGELOG.md](CHANGELOG.md), [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md). Verifică GitHub și, dacă faci deploy, serverul. Distinge întotdeauna PLANNED / CODED / MERGED / DEPLOYED / LIVE VERIFIED. Actualizează cele 3 fișiere în orice PR funcțional și statusul după fiecare deploy.