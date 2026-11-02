# PopeȘtiri — ROADMAP OPERABIL v2.0

**Actualizat:** 2026-11-02 | **Viziune:** debunking AUTOMAT al afirmațiilor virale în România.
**Citește la începutul fiecărei sesiuni:** [PROJECT_STATUS.md](PROJECT_STATUS.md) → acest roadmap → [PROJECT_AUDIT_2026-11-02.md](PROJECT_AUDIT_2026-11-02.md) → [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) → [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md) → [CHANGELOG.md](CHANGELOG.md).

> ## REGULĂ CRITICĂ / PROJECT CONTINUITY
> **FIECARE PR cu modificări funcționale trebuie să actualizeze ÎN ACELAȘI PR acest roadmap, PROJECT_STATUS.md și CHANGELOG.md.** CI verifică prezența actualizărilor. Fiecare actualizare notează ce s-a modificat, dovezi (teste), ce rămâne de făcut, riscuri, statutul cod/merge/deploy/live, commit și următoarea acțiune. **Merge nu înseamnă deploy; deploy nu înseamnă validare în producție.** După deploy se face actualizare status prin GitHub. Nu edita roadmap-ul direct pe Hetzner. Branch protection cu PR și verificări CI obligatorii trebuie activată separat în GitHub.

## 0. Obiectiv și happy path

PopeȘtiri nu este un agregator de știri sau un produs de community submissions. Descoperă automat afirmații care circulă în spațiul public, distinge afirmațiile verificabile de opinii/știri obișnuite, prioritiză impactul și semnalele reale de răspândire, cercetează dovezi, propune o concluzie revizuibilă, publică explicații și produce un ziar A4 tipărit. Contribuțiile manuale sunt opționale, niciodată sursa principală.

**Flux:** RSS / Google Trends RO / YouTube / surse permise → observații → `claim_leads` → grupare semantică de afirmații → semnale de răspândire și prioritate editorială DISTINCTE → generare de căutări → Tavily și surse primare → evidence store → comparație și verdict propus → review editorial → pagină publică → selecție ediție → media rights → PDF A4 → preflight → print.

**Principii:** viral ≠ fals; volum de știri ≠ reach; URL-uri multiple ≠ independența dovezilor; lipsa metricii ≠ zero; sursă cu restricții academice ≠ utilizare editorială permisă; LLM ≠ autoritate de adevăr; când dovezile sunt insuficiente nu fabricăm verdict sau materiale ca să umplem paginile.

## 1. Stare audit 2026-11-02

| Cod | Componentă | Status | Dovadă/limită |
|---|---|---|---|
| M0.1–M0.3A | API Node, PostgreSQL, admin, RSS, timer orar | **CODE + DEPLOY OBSERVED 2026-10-13** | PR #1–3, log operator |
| M0.3B | Social Intake manual | **CODE IMPLEMENTED** | PR #4–6; nu este viral discovery |
| M0.3C.1 | RSS/Trends/YouTube opțional | **CODE IMPLEMENTED** | PR #7–8; acces YouTube prod de reverificat |
| M0.3C.1.1 | Inbox și grouping provizoriu | **CODE IMPLEMENTED** | PR #9; matching lexical |
| M0.3C.2A | Claim Radar, referințe, observații | **CODE IMPLEMENTED** | PR #10; fără viral ranking |
| M0.3C.2A.1 | DeepSeek semantic pilot | **CODE IMPLEMENTED; LIVE EVAL PENDING** | PR #11–13; auto-paid off la ultima observare |
| M0.3C.2B / R1 | Claim-based query planner + social discovery + ranking | **TODO** | plan |
| R2 | Tavily + evidence checking | **TODO** | schemă/contract ≠ engine |
| R3 | Public debunking + workflow | **TODO** | nu există fact-check pages |
| R4 | PDF A4, media rights, Epson print agent | **TODO** | contract/spec ≠ funcțional |
| R5 | Ediție zilnică end-to-end | **TODO** | timer RSS ≠ ediție |

**Versiuni la audit live 2026-11-02:** GitHub main și checkout Hetzner `878d81b3eeae8305ff06870e8ac49028cf6b17b9` (PR #14 merged), API Docker / APP_VERSION `e181e3329c5ba4498478b501e9ef6d8d4a8261ce`. API/DB healthy, /ready OK, RSS active. Vezi [LIVE_AUDIT_2026-11-02.md](LIVE_AUDIT_2026-11-02.md).

### PR #14 CI reliability note (2026-11-02)

During the documentation PR, 3 discovery tests were found to have stale integration fixture timestamps fixed at 2026-10-11; the product's rolling seven-day grouping correctly excludes them in November. Integration test fixture now uses observedAt relative to the run date. Production grouping logic was not changed. CI rerun PASSED, PR #14 MERGED.

## 2. R0 — Baseline și pilot (P0; execută primul)

### R0.1 — Release AE489A4: deployed, worker verification pending (2026-11-02)

- PR #16 / CI trecut → merge `ae489a489139b92c90686fbf6f0b15d2ea926dc2`; operatorul a construit imaginea și a făcut deploy pe Hetzner. API healthy, DB healthy, `/ready` OK, timer RSS activ; fără migrări.
- Backup DB 4,5 MB cu listare `pg_restore -l` validată, dar restaurarea completă nu a fost testată.
- Curățenie conservatoare: `docker builder prune --force --filter until=168h` a eliberat spațiu (84% → 64% used; 12 → 27 GB free). Nu s-au șters imagini de rollback, volume sau containere.
- **Acum:** validare funcțională a cozii (250 vechi pot fi reîncadrați ca up-to-date în prima rulare; apoi `never_processed` trebuie să scadă). Nu declara fixul complet înainte de jurnalul și SQL-ul live, nu confunda sănătatea API cu claim extraction quality.
- După verificare: pilot fără paid calls, gold set, Google Trends 1 candidat.



### R0.1 — Cauza blocajului confirmată în producție (2026-11-02)

- Din 8.172 discovery candidates, 7.922 nu au fost procesați niciodată în Claim Radar. Cele 250 cu state existent apar toate stale; ultimele șase rulări au raportat constant `candidates=250, leads=0, failed=0, complete=false`.
- Query read-only de precizie: **250/250 rânduri au `c.updated_at > s.last_candidate_updated_at` cu diferență pozitivă sub 1 ms**; diferență medie 0,4758 ms. Aceasta confirmă că pierderea microsecundelor în interfața Node PostgreSQL este mecanismul de starvation.
- **Remediere CODED pe branch, NU DEPLOYED:** în `runClaimRadar`, selecția aduce `c.updated_at::text AS updated_at` ca să nu treacă prin JS Date la checkpoint; `markUnchanged` și `persistClaimLead` păstrează astfel microsecundele. Test nou cu fracții de 6 cifre și batch size 1 pentru drain, rerulare zero și update fără recalcularea extracției. Nu sunt migrări.
- **Gate:** CI typecheck și toate testele trebuie să treacă; apoi merge/deploy controlat, backup conform runbook, smoke și monitorizare câteva rulări. Nu declara rezolvat în producție înainte de reducerea `never_processed` și de dispariția celor 250 falsely stale. 
- **După fix:** pilotul semantic `--preview --limit=20`, gold set, diagnostic separat pentru Google Trends (numai 1 rezultat).



### R0.1 audit LIVE — constatări 2026-11-02
- **Confirmat:** server `88.99.81.51`, checkout documente `878d81b`, API image `e181e33`, API/DB healthy, `/ready` databaseChecked true, timer RSS activ.
- **Colectare:** 8.172 discovery candidates (483 în ultimele 24h / 2.687 în 7 zile); Digi24 2.619, G4Media 2.571, HotNews 1.912, YouTube 1.069, Trends 1. Ultimele 10 discovery runs sunt succeeded.
- **BLOCAJ P0 înainte de R0.2/R1:** numai 250 claim leads, zero în ultimele 7 zile, zero testable_claim; 210 uncertain/38 ordinary_news_event/2 entertainment, toate deterministic. **Cauză neconfirmată; se impune diagnostic read-only** pentru state și run audit, vezi [LIVE_AUDIT_2026-11-02.md](LIVE_AUDIT_2026-11-02.md).
- **Nu se declară R0.1 complete** până ce cauza celor 250 lead-uri este investigată; health/discovery success ≠ claim pipeline functional.
- **Google Trends 1 rezultat** investigat separat. Nu implementa API social/Tavily înainte de stabilirea backlogului de extragere.



**R0.1 Audit read-only live:** SHA Git și imaginea Docker, /health și /ready, migrări, timer systemd, loguri, număr de articole și candidați, surse active, YouTube configurat (fără afișarea cheii). Separă codul de comportamentul live.

**R0.2 Preview 20 candidați:** `node apps/worker/claim-pilot.ts --preview --limit=20` într-un container existent, fără `--paid`; salvează raport, eșantion RSS/YouTube, zero scrieri în tabelele de pilot.

**R0.3 Gold set:** clasificare manuală pentru testable claims, opinii, preziceri, promisiuni, citate, numere, negații, știri obișnuite, clickbait, surse insuficiente. Măsoară precision, recall, false positives, atribuire, polaritate.

**R0.4 DeepSeek test opțional:** apeluri reale NUMAI după aprobare explicită de buget, cheie/model, termeni și limite per run; compară cu R0.3; cache și token usage real/unknown; nu porni implicit în scheduler.

**DoD R0:** raport reproductibil, erori documentate, decizie despre extractoare și stare live verificată.

## 3. R1 — Automatic Viral Discovery Engine (P0)

**R1.1 Claim identity:** normalizare entități, perioadă, sume și polaritate; păstrează assertion original + parafrază și proveniență. Clustere de afirmații echivalente, nu simpla asemănare a titlurilor; nu uni negarea cu afirmația.

**R1.2 Query planning:** din claims și topicuri emergente generează formulări exacte, sinonime românești, nume, date, expresii opuse și query-uri platform-specifice permise; dedup, buget, maxQueries, jurnal motiv/query și audit.

**R1.3 YouTube targeted:** reutilizează API-ul oficial, separă search recent de chart mostPopular, afișează limite și date reale; spoken claims numai când există transcript/licență, fără transcrieri inventate.

**R1.4 Public-index și RSS expansion:** surse românești/locale validate, referințe indexate public la materiale sociale numai unde termenii permit, rezultate de căutare cu provenance și latență. Nu pretindem vizibilitate completă în TikTok/Instagram/Facebook.

**R1.5 Viral Signal Engine:** patru axe SEPARATE: atenție observată (Trends, rezultate, metrici API), trend observat în timp (minimum două snapshoturi comparabile), interes public/risc, verificabilitate. Fără scor de „probabil fals”, metrici lipsă ca unknown. Ranking explicabil, cu incertitudine.

**R1.6 Radar UI:** shortlist automat, motivul priorității, platforme efectiv acoperite, surse, observații, limitări, mark investigate/defer/duplicate/dismiss și audit. Manual Social Intake = fallback, nu input obligatoriu.

**DoD R1:** sistemul propune automat afirmații cu interes public și dovezi despre apariția/răspândirea observabilă, fără linkuri furnizate obligatoriu de cititori.

## 4. Flux paralel SP — TikTok / Instagram / Facebook

**SP.1 TikTok Research (academic only):** cererea depusă 2026-10-13, dar status neconfirmat. Claude Browser 2026-11-02 a găsit Research projects gol în contul ASE și nicio confirmare în Gmail personal; inboxul academic ASE nu a fost căutat. Verifică inboxul academic/contul corect și contactează TikTok dacă e nevoie. **Fără conectare directă Research API la PopeȘtiri editorial** fără consimțământ scris/termeni verificați. Datele de cercetare izolate de candidate, observations append-only, DeepSeek, Tavily și output public; reguli retenție și ștergere.

**SP.2 TikTok editorial:** căutare automată a referințelor public-indexate unde este permis sau furnizor social-listening autorizat contractual; cere dovadă de acoperire RO, permisiuni editoriale/redistribuire, retenție, ștergeri, latență, metrici, costuri. Nu presupune API generic TikTok sau scraping.

**SP.3 Instagram:** componentă planificată explicit; evaluează Graph/Instagram API și furnizor autorizat, drepturi per tip de cont; nu presupune căutare globală a profilurilor.

**SP.4 Facebook:** evaluează acces la pagini publice și furnizori; fără profile private/grupuri fără drepturi.

**SP.5 Policy gate:** tag provenance `academic_research`, acces și procesare izolate, teste care blochează persistența în editorial. Fixture sintetice pentru API neaprobat.

**DoD SP:** un provider fără aprobare este `unavailable`; nicio scurgere a datelor academice în pipeline editorial.

## 5. R2 — Tavily / Evidence / Fact-checking (P0)

**R2.1 Tavily Search + Extract:** căutări pro/contra/context, surse primare prioritare, timeout, retry, cache, rate limit, buget, provenance, verificare URL/SSRF, erori explicite. Tavily oferă căutare, nu verdict.

**R2.2 Evidence repository:** case ID, assertion originală, document, publisher, URL, retrievedAt, publishedAt, excerpt ancorat, independență/provenance, rol suportă/contrazice/contextualizează, limitări și versiuni. Surse diferite care copiază aceeași declarație nu sunt independente.

**R2.3 Comparare:** verifică date, timp, instituție, jurisdicție, numere, negații, citate, contradicții, contexte; textul sursei este DATE, nu instrucțiuni AI. Absența documentelor ≠ fals.

**R2.4 Rubric verdict:** `CONFIRMAT`, `CORECT, DAR LIPSEȘTE CONTEXT`, `CONTEXT FALS`, `CONTESTAT`, `NECONFIRMAT`, `FALS`, `NU ESTE O AFIRMAȚIE VERIFICABILĂ`; criterii documentate. Separă propunerea AI de acceptarea editorială.

**R2.5 Audit & review:** evaluări revizuite, motive pentru schimbarea verdictului, cazuri sensibile cu dovezi mai puternice. Nu publica verdict nejustificat.

**DoD R2:** 1 dosar de afirmație reală cu dovezi citabile, context, limitări și concluzie revizuită ori refuz motivat.

## 6. R3 — Digital Debunking (P0)

**R3.1 Editorial workbench:** new/researching/review/approved/published/corrected; istoric și audit; afirmația originală + dovezi + erori + răspundere.

**R3.2 Redactare:** explicație românească simplă pentru cititori, ce s-a afirmat/ce s-a verificat/ce spun sursele/ce nu știm/concluzie. Nu amplifica clickbait, nu inventa citate.

**R3.3 Public pages:** `/verificare/<slug>` stabil, verdict și explicație, linkuri la dovezi, checkedAt, istoric corecții, acces mobil, QR permanent.

**DoD R3:** un debunking adevărat, surse vizibile, decizie documentată, disponibil online și pe telefon.

## 7. R4 — Printed Newspaper (P1)

**R4.1 Edition composer:** selectează din materiale aprobate, ierarhie editorială debunking-first, nu umple automat 4 pagini; snapshot de revizie.

**R4.2 Media rights:** fotografie/ilustrație cu drepturi aprobate, credit, dimensiuni, DPI, crop. Imaginile RSS au drepturi necunoscute până la validare; politica originală cere câte o fotografie la articol.

**R4.3 A4 PdfRenderer:** layout retro PopeȘtiri, portret 210×297 mm, maximum 4 pagini, diacritice, fonturi încorporate, QR, fotografii, legende. Chromium inițial, provider interschimbabil.

**R4.4 Preflight:** zero text tăiat, fără suprapuneri, credite, QR scanabil, drepturi, DPI și checksum; dacă nu trece, status `blocked`.

**R4.5 Epson L5390:** comportament observat **simplex**; [print-spec.md](print-spec.md) menționează duplex ca țintă teoretică ce trebuie corectată/validată. Primele probe presupun o singură față și hârtie compatibilă cu aspect retro.

**R4.6 Agent local:** Raspberry Pi sau alt device în LAN numai dacă e necesar; CUPS/driver, pull outbound, request ID/checksum, reconciliere, fără tipăriri duplicate. **MacBook nu trebuie să rămână pornit.**

**DoD R4:** PDF A4 trecut prin preflight și probă Epson fizică reușită; apoi flux de print fără Mac.

## 8. R5 — Automatizare zilnică și calitate (P1)

**R5.1 Scheduler de ediție distinct de cron RSS:** țintă configurabilă 05:15 inițiere, 06:30 PDF, ~07:00 print, Europe/Bucharest/DST; etape cu checkpoint și idempotency.

**R5.2 Recovery:** retry bounded, locks, heartbeat pe procese lungi, reconciliere joburi CUPS, fără dublare a facturilor API sau paginilor print.

**R5.3 Observabilitate:** surse, claim leads utile, precision/recall, dovezi primare, propoziții fără suport, buget/tokens, PDF, printer, backup, starea exactă a ediției și alerte.

**R5.4 Politică editorială:** corecții publice, drepturi, ștergeri, afișarea limitelor datelor și refuzul publicării când nu există dovezi.

**DoD R5:** ediție zilnică reproductibilă, costuri controlate, fără ziar inventat în zilele fără cazuri eligibile, imprimare idempotentă.

## 9. Vertical slice obligatoriu înainte de extindere masivă

**1 caz real descoperit AUTOMAT → afirmație exactă → căutări generate → dovezi → evaluare revizuită → pagină publică → PDF A4 + QR → preflight → imprimare.** Nu aștepta toate rețelele sociale pentru acest experiment.

## 10. Backlog în ordinea recomandată

| ID | Milestone/PR | Stare |
|---|---|---|
| P0-01 | Audit live + fix precizie timestamp Claim Radar + pilot 20 | DEPLOYED ae489a4; WORKER VERIFICATION PENDING |
| P0-02 | Gold set + evaluare extraction | TODO |
| P0-03 | Calibrare DeepSeek, doar dacă e justificată | TODO |
| P0-04 | Claim normalization/semantic matching | TODO |
| P0-05 | Query generation din claims | TODO |
| P0-06 | YouTube targeted & public-index | TODO |
| P0-07 | Viral signal & ranking explicabil | TODO |
| P0-08 | Tavily Search/Extract cu buget | TODO |
| P0-09 | Evidence store + comparisons | TODO |
| P0-10 | Verdict propus + review | TODO |
| P0-11 | Public fact-check pages | TODO |
| P1-12 | Edition composer + drepturi media | TODO |
| P1-13 | A4 PDF + preflight | TODO |
| P1-14 | Epson print agent local | TODO |
| P1-15 | Orchestrare ediție zilnică | TODO |
| SP-16 | TikTok research status și research data gate | BLOCKED on approval/terms |
| SP-17 | Instagram/Facebook compliant provider | BLOCKED on provider access |

## 11. Definition of Done pentru FIECARE PR

1. Citește `AGENTS.md` și fișierele de status/roadmap; selectează ID-ul milestone-ului și acoperirea.
2. Schimbări pe branch nou din `origin/main` prin **Codex sau Claude Code**; niciodată direct pe main sau pe server.
3. Typecheck, teste relevante, suită completă și review al impactului asupra schemelor, datelor, costului, integrărilor, drepturilor.
4. Actualizează în **același PR** `docs/roadmap.md`, `docs/PROJECT_STATUS.md`, `docs/CHANGELOG.md` cu cod/merge/deploy/prod și next steps; fără status fictiv.
5. PR pe GitHub; CI verde **incluzând continuity guard**; review; merge numai când aprobat.
6. Pentru deploy pe Hetzner: verificare read-only → backup DB dacă există migrări → checkout SHA aprobat → build imagine tag SHA → migrări tranzacționale → API/ready/DB/timer → smoke tests; nu atinge celelalte stackuri.
7. După deploy, **PR nou sau actualizare GitHub** care înregistrează exact live SHA, data, verificările, regresiile, următorul pas; apoi sincronizează docs pe server. Un CI green nu demonstrează producție sănătoasă.
8. Nu edita migrări deja aplicate, nu copia secrete, nu activa API plătite ori TikTok academic în editorial din proprie inițiativă.

Vezi [WORKING_AGREEMENT.md](WORKING_AGREEMENT.md) și [SERVER_RUNBOOK.md](SERVER_RUNBOOK.md).