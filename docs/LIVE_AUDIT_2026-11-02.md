# PopeȘtiri — LIVE AUDIT, 2026-11-02

> Dovezi: comenzi read-only executate de operator pe Hetzner pe 2026-11-02 ~13:20 UTC (15:20 București). Nu am executat SSH direct și nu am modificat runtime-ul sau DB.

## Identity & availability
- Server Hetzner IP `88.99.81.51`, hostname `ubuntu-4gb-fsn1-1`, dir `/opt/popestiri`.
- Git checkout și docs sincronizate: `878d81b3eeae8305ff06870e8ac49028cf6b17b9` (PR #14); imagine API și APP_VERSION continuă să fie `e181e3329c5ba4498478b501e9ef6d8d4a8261ce`. Corect: PR #14 nu necesita rebuild.
- API container healthy (up 2 săptămâni), PostgreSQL healthy (up 3 săptămâni), `/ready` -> `{"status":"ok","databaseChecked":true}`, RSS systemd timer = `active`.
- Migrațiile 0001–0010 confirmate anterior pe 2026-10-13, nu reinterogate în acest pas.

## Colectare

Toate cele șase rânduri din `discovery_source_registry` sunt enabled (RSS Digi24/HotNews/G4Media, YouTube RO, Google Trends RO, Social Intake manual). Enabled ≠ funcțional; Social Intake nu este automat.

| Discovery source | Total | Ultimele 24 h | Ultimele 7 zile |
|---|---:|---:|---:|
| Digi24 | 2619 | 184 | 871 |
| G4Media | 2571 | 129 | 895 |
| HotNews | 1912 | 87 | 576 |
| YouTube Data API România | 1069 | 82 | 344 |
| Google Trends România | 1 | 1 | 1 |
| **TOTAL** | **8172** | **483** | **2687** |

Ultimele observații pe surse: 2026-11-02 13:00:06–13:00:08 UTC. Separat, tabelul `source_items` din ingestia RSS conține 2724 articole asociate sursei Digi24, ultima colectare la 13:00:06 UTC. Acesta este un tabel separat de `discovery_candidates`; NU înseamnă că celelalte RSS nu se colectează.

Ultimele **10 rulari** din `discovery_runs`: toate succeeded, interval 04:00–13:00 UTC, 181 candidates_seen per rundă, 1–33 candidates_added per rundă, 23–29 groups_updated. Nu demonstrează calitatea claim extraction. Google Trends având doar **1 candidat total** este un semnal ce cere analizarea rezultatelor adaptorului.

## Claim Radar — BLOCAJ P0

| Clasificare | Extracție | Total | Ultimele 7 zile |
|---|---|---:|---:|
| uncertain | deterministic_v1 | 210 | 0 |
| ordinary_news_event | deterministic_v1 | 38 | 0 |
| entertainment | deterministic_v1 | 2 | 0 |
| testable_claim | — | 0 | 0 |
| **TOTAL** | | **250** | **0** |

**Critic:** 8172 candidate discovery vs 250 claim leads, toate fără `last_observed_at` din ultimele 7 zile, niciun `testable_claim`. Sistemul colectează, dar radarul automat de afirmații virale nu produce încă rezultatul dorit.

**Cauză NECONFIRMATĂ.** Codul arată batch size implicit 250 în `runClaimRadar`, folosește `claim_radar_candidate_state` și selectează candidați noi/actualizați după `c.updated_at`, în ordine crescătoare; 250 leads exact cât batch limit este o coincidență relevantă, NU dovadă de bug. Cerem starea de procesare, candidații neprocesați și jurnalul claimRadar per rulare.

## Următorul diagnostic (numai READ ONLY)

~~~sql
BEGIN TRANSACTION READ ONLY;
SELECT count(*) total_candidates,
 count(*) FILTER (WHERE created_at >= now()-interval '7 days') created_7d,
 count(*) FILTER (WHERE updated_at >= now()-interval '24 hours') updated_24h
FROM discovery_candidates;
SELECT processing_status,count(*) total,min(last_processed_at) first_processed,
 max(last_processed_at) last_processed,
 count(*) FILTER (WHERE last_processed_at >= now()-interval '24 hours') processed_24h
FROM claim_radar_candidate_state GROUP BY processing_status;
SELECT count(*) FILTER (WHERE s.candidate_id IS NULL) never_processed,
 count(*) FILTER (WHERE s.candidate_id IS NOT NULL AND c.updated_at > s.last_candidate_updated_at) stale_processing,
 count(*) FILTER (WHERE s.candidate_id IS NOT NULL AND c.updated_at <= s.last_candidate_updated_at) up_to_date
FROM discovery_candidates c LEFT JOIN claim_radar_candidate_state s ON s.candidate_id=c.id;
SELECT historical_backfill_complete,last_run_at FROM claim_radar_checkpoint WHERE id='default';
SELECT created_at,after_value->'claimRadar' claim_radar
FROM audit_events WHERE entity_type='discovery_run' AND action='discovery_run_finished'
ORDER BY created_at DESC LIMIT 6;
COMMIT;
~~~

**După această verificare:** evaluarea de preview semantic pe 20 de candidați (fără paid calls), apoi fix prin Codex/Claude Code pe feature branch + CI + documentație în PR. Investighează separat Google Trends 1 candidat.

## Alte observații de infrastructură (nu blocaj imediat)
Hetzner login 2026-11-02: 80,1% spațiu disc, 46% swap, 19 procese zombie, actualizări restante/restart required. Serverul este partajat cu alte aplicații: fără reboot, prune global sau alte operațiuni fără plan.

**Stare:** audit parțial complet, blocaj claim pipeline în investigare. Nicio modificare DB, API, timer sau Compose.

## Confirmare root cause — 2026-11-02 (query read-only operator)

PostgreSQL a arătat `procesati=250`, `decalaj_sub_1_ms=250`, `decalaj_peste_1_ms=0`, `decalaj_mediu_ms=0.4758`. Corelat cu `never_processed=7922`, `stale=250`, `up_to_date=0` și 6 rulari identice `candidates=250/leads=0/failed=0`, confirmă că checkpointul pierde microsecundele timestampului prin conversia pg→JS Date. Un fix propus citește timestampul din baza de date ca text exact, plus teste și rollout controlat. **Nicio intervenție live nu a fost executată pentru acest fix.**


## Release follow-up (14:19 UTC, 2 Nov 2026)

Operatorul a confirmat API la imaginea `popestiri-app:ae489a489139b92c90686fbf6f0b15d2ea926dc2` healthy, PostgreSQL healthy, `/ready` = `{"status":"ok","databaseChecked":true}`, timer RSS repornit. Backup `popestiri_20261102T140956Z.dump` listat cu `pg_restore -l`, 4,5 MB, nu restaurat într-un test. Docker build cache prune selectiv (>7 zile), 84% → 64% disc utilizat. **Claim Radar backlog post-deploy nu a fost încă măsurat**, deci starea este DEPLOYED + INFRA LIVE VERIFIED, nu FUNCTIONALLY VERIFIED.

## Functional validation COMPLETE — 2026-11-02 14:27:36 UTC

Operator executed two controlled `systemctl start popestiri-rss-ingest.service` invocations after installing `ae489a4`. Both one-shot worker runs succeeded; RSS timer restored and active after each.

| Evidence | 14:24:56 UTC first cycle | 14:27:36 UTC second cycle |
|---|---:|---:|
| discovery candidates | 8211 | 8211 |
| Claim Radar up_to_date | 250 | 500 |
| claim candidates never processed | 7961 | 7711 |
| stale | 0 | 0 |
| run candidates | 250 | 250 |
| run leads | 0 | 250 |
| run failed | 0 | 0 |

Interpretation: first run repaired the pre-existing 250 timestamps; second reached the next 250 never-processed records, confirming that the microsecond starvation bug is **fixed in production**. Total candidate count increased from earlier baseline 8172 to 8211 due to 39 new records, explaining the initial rise in never-processed from 7922 to 7961.

**Editorial caveat:** 500 extracted leads: `uncertain=414`, `ordinary_news_event=84`, `entertainment=2`, `testable_claim=0`. Extraction quality is not validated; no annotated gold set. Next step is 20-candidate representative deterministic preview (zero paid calls) and manual labeling. Keep healthy infrastructure and editorial accuracy as distinct tracks.
