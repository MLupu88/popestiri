# PopeȘtiri — PROJECT STATUS / START HERE

**Audit static:** 2026-11-02 | **Sursa oficială:** GitHub main | **Actualizări obligatorii:** [roadmap.md](roadmap.md) + acest fișier + [CHANGELOG.md](CHANGELOG.md) în fiecare PR funcțional.

## Unde am rămas?

- **Produs:** radar automat de afirmații virale în România, verificare pe dovezi, debunking, pagini publice, PDF A4 și tipărire Epson. Nu trebuie să depindă de linkuri trimise de cititori și nu trebuie să fie doar un agregator de știri.
- **Ultimul HEAD GitHub observat:** `e181e3329c5ba4498478b501e9ef6d8d4a8261ce` — PR #13 merge din 2026-10-13; PR #1–13 integrate. Recitește HEAD înainte de lucru.
- **Producție, ULTIMA OBSERVARE 2026-10-13 (nu o verificare live la 2026-11-02):** API imagine `popestiri-app:e181e33...` healthy, /health 200 prin HTTPS, PostgreSQL migrări `0001–0010`, RSS timer activ; DeepSeek automat false/max calls 0. Operatorul a creat backup DB (~733 KB, lista pg_restore citibilă). API /ready nu a fost probat în ultimul set de loguri.
- **Problema rămasă:** preview-ul pe 20 de articole a fost comandat după o afișare `systemctl list-timers` în pager; nu s-a primit niciun raport al pilotului. Nu declara validare realizată.
- **Teste:** Codex a raportat 68/68 full + 12/12 semantic + typecheck pe PR #13; GitHub CI = passed. Nu am executat noi teste în auditul documentar.
- **YouTube:** adaptor există, acces real/cheie în producție neconfirmată. Instagram/Facebook/TikTok: fără API automate aprobate în editorial.
- **TikTok academic:** cererea 2026-10-13 nu apare în loginul ASE inspectat de Claude Browser (2026-11-02); inboxul personal nu avea confirmare; **inboxul instituțional nu a fost inspectat**. Nu presupune approved/rejected. Nu introduce academic research data în editorial fără autorizare scrisă/termeni.
- **Tavily, evidence/verdict runtime, pagini publice fact-check, PDF, agent print:** neimplementate, deși unele contracte și tabele există.

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

## Next action (P0)

1. Audit Hetzner **read-only**: code/image SHA, `/ready`, DB/migrări, RSS timer/loguri, surse, YouTube (fără chei tipărite).
2. Execută pilotul deterministic `--preview --limit=20` fără paid calls; colectează raportul și etichetează cazurile.
3. Fă gold set / metrici; abia apoi calibrare DeepSeek.
4. Construiește R1 claim-based query planner + auto social/public-index permitted + ranking explicabil.
5. Construiește R2 Tavily/evidence și primul debunking validat.
6. R3 pagină publică; R4 PDF/print; R5 autonomie zilnică.

## Stare milestone

| ID | Stare | Următor pas |
|---|---|---|
| M0.1–M0.3C.1.1 | CODE IMPLEMENTED | live verify actualizat |
| M0.3C.2A | CODE IMPLEMENTED | evaluare a priorității și matching |
| M0.3C.2A.1 | CODE IMPLEMENTED / PILOT NOT EVALUATED | preview 20 |
| R1 Viral Discovery | TODO | query planner |
| R2 Evidence/Tavily | TODO | evidence connector |
| R3 Public case/editorial | TODO | vertical slice |
| R4 PDF/Epson | TODO | prototype + physical QA |
| R5 Daily autonomous edition | TODO | scheduler separat |

## History / handover

**2026-11-02:** creat pe branch de audit un set de documente pentru continuitate și o verificare CI obligatorie; **nu presupune merge sau sincronizare server până nu sunt confirmate**.

**La începutul oricărei sesiuni noi:** citește [AGENTS.md](../AGENTS.md), [roadmap.md](roadmap.md), acest status, [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md), [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md), [CHANGELOG.md](CHANGELOG.md), [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md). Verifică GitHub și, dacă faci deploy, serverul. Distinge întotdeauna PLANNED / CODED / MERGED / DEPLOYED / LIVE VERIFIED. Actualizează cele 3 fișiere în orice PR funcțional și statusul după fiecare deploy.