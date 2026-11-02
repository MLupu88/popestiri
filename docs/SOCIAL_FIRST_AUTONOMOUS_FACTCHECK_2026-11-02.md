# PopeȘtiri — Decizie de produs: SOCIAL-FIRST + FACT-CHECKING AUTONOM (2026-11-02)

**Status:** PRODUCT DIRECTION CONFIRMED BY OWNER; document de planificare, **NU** implementare și **NU** aprobare de acces la platforme sau publicare automată în producție.

## 1. Corecția priorităților

PopeȘtiri este un **motor autonom de detectare, verificare și explicare a afirmațiilor publice potențial înșelătoare**, cu pagină web și ediție A4 imprimată. Ținta este ceea ce circulă pe TikTok, Facebook și YouTube — nu colectarea în masă de articole din publicațiile mainstream.

**Prioritatea descoperirii:** TikTok → Facebook → YouTube, în funcție de accesul real autorizat, relevanța RO și metricile permise; Instagram poate urma. Aceasta este o prioritate a produsului, nu o afirmație că fiecare platformă este deja conectată.

**RSS/știri clasice:** rol secundar: context, coroborare, citate atribuite, găsirea surselor originale și identificarea subiectelor emergente. Nu tratăm RSS ca dovadă de viralitate, nici social media ca prezumție de falsitate.

**Nu există obligație de aprobare manuală a fiecărei afirmații sau fiecărui articol.** Ținta este publicare automată, cu „abstain” / „insufficient evidence” în loc de verdict sau publicație nejustificată. Intervenția umană rămâne pentru excepții, corecții și audit, nu ca pas constant. Nu declanșăm automat publicarea înainte de a implementa și valida politicile stricte de dovezi și teste.

## 2. Pipeline țintă

1. **Social signal discovery:** feeduri/căutări pentru conținut public accesibil legal, liste de conturi/canale, query-uri generate din teme și afirmații, detectarea recirculării între platforme. Pentru fiecare: platformă, ID/URL original, data autorului/publicării, timestamp colectare, text/descriere, metrics disponibile + limitări; null când lipsesc.
2. **Content extraction:** numai titlu/descriere/transcript obținut legal și efectiv disponibil; pentru video, ASR doar dacă drepturile și accesul permit. Nu inventăm ce se spune într-un video doar din titlu.
3. **Claim identification:** aserțiuni exacte, entități, dată, loc, polaritate, numere, autor atribuit; grupare semantică a aceleiași afirmații cu păstrarea variantelor și a negației.
4. **Spread prioritization:** semnale de distribuție real observate din *aceeași platformă* la două sau mai multe momente, apariții independente, trend, risc/interes public și verificabilitate. **Popularitatea nu este dovadă de falsitate**, lipsa API-ului înseamnă unknown, nu zero.
5. **Evidence research:** interogări pro/contra/context prin Tavily și alte surse autorizate; documente originale/primare; validarea citatelor, cronologiei, datei, unităților, numerelor, jurisdicției și identităților. Mai multe articole care copiază aceeași sursă = un singur grup de proveniență.
6. **Evidence decision engine:** compară afirmația originală cu dovezi verificabile; păstrează extrase exacte, URL, data capturii, limitări și lanțul de audit. Modelul poate propune interpretări, dar **nu devine singur autoritate de adevăr**.
7. **Automated decision gate:** trei rezultate distincte:
   - `auto_publish`: numai când condițiile măsurabile de dovezi și calitate sunt îndeplinite, iar evaluarea pe gold set demonstrează fiabilitate suficientă pentru clasa de caz;
   - `hold_for_exception`: conflict, sursă insuficientă, nume/persoane/acuze sensibile, cote/ASR lipsă, inconsistență numerică sau risc juridic;
   - `no_verdict`: neverificabil/insuficient, fără publicarea ca verdict fals.
8. **Publication:** pagină cu afirmația exactă, cine a făcut-o și unde (când este permis), verdict bine definit, dovezi pentru/contra, ce nu știm, dată verificare, jurnal de corecții și QR stabil. Ediția tipărită include doar materiale validate și trece QA PDF.
9. **Monitoring and corrections:** reevaluează cazurile dacă apar dovezi noi; correction/withdrawal transparent; audit, metrci de false positives/false negatives și alerte excepționale către operator.

## 3. Autonomia nu elimină controlul calității

Aprobarea proprietarului fiecărui articol NU este cerință de produs. Totuși o concluzie falsă despre sănătate, persoane sau alegeri poate produce prejudicii. De aceea **publicarea automată este condiționată de teste**, nu activată prin simpla setare a unui prag LLM.

- Contract publicabil: afirmație atomică ancorată în original, minimum o dovadă primară când există, coroborare independentă pentru concluzii sensibile, evidență pro și contra, cronologie, politică explicită de abstention, niciun număr/citat inventat.
- Gold set românesc: exemple sociale reale furnizate prin căi permise sau fixture sintetice, etichetări editorial independente, negări, satiră, ironie, deepfake, date vechi recirculate, statistici rupte din context, afirmații medicale, politice, urgențe.
- Măsurăm precision/recall pe detecție, acuratețea atribuției, fact-check correctness și false accusation rate, inclusiv pe categorii sensibile. Un număr de URL-uri sau un „confidence 95%” de la model NU este dovadă suficientă.
- Întâi publicare în **shadow mode**, apoi canary într-un domeniu/staging delimitat, cu revizuirea statistică a erorilor, apoi eventuala activare progresivă în producție. Operatorul intervine pentru incidente/excepții și corecții, nu pentru fiecare caz.

## 4. Fezabilitatea surselor (se verifică la implementare)

| Platformă | Stare PopeȘtiri la 2026-11-02 | Următoarea implementare realistă |
|---|---|---|
| **TikTok** | Nu există adaptor editorial automat aprobat. TikTok Research a fost solicitat anterior dar status/acces rămâne neconfirmat; **datele academice nu pot intra în editorial fără drept explicit.** | Validăm în scris un provider editorial autorizat cu acoperire România sau căutări/referințe public-indexate permise. Canary fixture până la acces efectiv; transparență pentru coverage și latență |
| **Facebook** | Nu există descoperire automată generală; Social Intake manual ≠ crawler editorial | Allowlist de public Pages după drepturi Meta aprobate sau provider contractual cu indexare legală a postărilor publice. Fără profiluri/grupuri private |
| **YouTube** | Adaptor oficial live în discovery, dar căutare generală și metrics limitate; fără analiză sigură a conținutului video. 1.069 candidați observați în auditul anterior | Query planner țintit pe narațiuni/afirmații, channel watchlist, growth pe snapshoturi ale aceluiași video, captions/ASR când autorizat |
| **Instagram** | Planificat, neconectat | Coverage permis, conturi eligibile și provider autorizat, separat de Facebook |
| **RSS** | Ingestie funcțională | Fallback pentru evidențe/context și narațiuni; nu este sursa principală a radarului |

Un adaptor fără permisiuni este explicit `unavailable`, nu „funcțional parțial” fără dovezi. Nu facem scraping neautorizat, nu pretindem acces global ori metrici absente. Contractele/politicile furnizorilor se verifică înainte de alegerea unei integrări plătite.

## 5. Noua ordine P0

- **P0-S1 — Platform access & real social signal contract:** acces real YouTube oficial + TikTok/Facebook prin căi licențiate; matrice de coverage și budget; fixture/simulator de mesaje publice fără a le prezenta ca date live.
- **P0-S2 — Social claim discovery:** query planner social-first + clustering, observații de răspândire și ledger de proveniență, înainte de extinderea RSS.
- **P0-S3 — Extraction on social content:** titlu/descriere/transcript existent; evaluare pe golden set RO și test de rezistență la informație insuficientă.
- **P0-S4 — Evidence retrieval/verification:** Tavily și surse primare, comparație și clasificare dovezi; audit reproductibil.
- **P0-S5 — Policy-driven autonomous gate:** `auto_publish / hold_for_exception / no_verdict`, shadow mode, gold set, metrice și re-evaluare periodică.
- **P0-S6 — Public debunk page + A4/QR:** primele cazuri corecte fără aprobări obligatorii per articol; template editorial, PDF, apoi print agent Epson.
- **P0-S7 — Scheduler:** automatizare zilnică a acestor componente, monitorizare, opt-in publicare graduală.

**Nu confunda**: cod scris ≠ integrare autorizată; „pilot preview reușit pe 20” ≠ fact-checking reușit; detectarea unei afirmații ≠ detectarea unei dezinformări; excepție/audit uman ≠ semnătură obligatorie zilnică.

## 6. Stare reală și next step

- Claim Radar queue starvation a fost fixat în producție pe imaginea `ae489a4` (14:27 UTC: 500 processed, stale 0).
- Pilotul zero-paid semantic rulat pe imaginea construită `e87df4c` a returnat 20/20, `testable_claim=3`, `uncertain=13`, `ordinary_news_event=3`, `entertainment=1`; zero API calls. **Nu este verificare factuală; `truthfulness=unassessed` în toate cazurile.**
- Imaginea `e87df4c` a fost construită și rulată ca one-shot preview, dar la ultima observație API live rămânea `ae489a4`. Nu declara `e87df4c` deployed.
- Următorul PR de implementare: `P0-S1/S2` — contract de surse sociale autorizate, YouTube targeted și simulator/teste de flux social înainte de a cere acces/costuri TikTok/Meta; fără a schimba încă publicarea live.
