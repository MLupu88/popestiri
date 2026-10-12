# M0.3C.2A — Viral Claim Radar Foundation

PopeȘtiri descoperă mai întâi afirmații publice verificabile, apoi le poate trimite în fluxul editorial de verificare. O afirmație din radar nu este un verdict și nu este copiată în `claims`; acea tabelă rămâne parte din fluxul de verificare cu dovezi.

## Ce se păstrează

- `discovery_candidates` rămâne inboxul brut, cu proveniența adapterului.
- `claim_leads` păstrează afirmația extrasă, textul exact disponibil, parafraza automată când există, clasificarea, metoda/modelul/versiunea și limitele.
- `claim_lead_references` păstrează fiecare candidat, URL, publisher/channel, platformă, metoda de discovery și timpii de publicare/observare. Referințele diferite nu sunt dovadă independentă una pentru cealaltă.
- `claim_observations` este append-only și păstrează măsurători timestamped. Pentru YouTube se salvează doar `viewCount` și `commentCount` returnate de API. RSS, rankul de căutare și numărul de publicații nu sunt transformate în reach.

Un singur punct de date este afișat ca **insufficient history**. Schimbarea observată se calculează doar între snapshot-uri ale aceluiași video/candidat și aceeași metric source, la momente distincte. Vizualizările și comentariile sunt calculate independent; referințele diferite nu produc growth agregat la nivel de claim. Lipsa câmpului este afișată ca indisponibilă, nu ca zero.

Landing view `/admin/claims` afișează implicit doar `testable_claim`. Buletinele generice, divertismentul, evenimentele ordinare și semnalele incerte rămân accesibile prin `?classification=` ca triere explicită, fără să concureze cu afirmațiile verificabile.

## Extracție și grupare

`packages/claims/extractor.ts` oferă un contract Zod strict. În configurația implicită, clasificarea este deterministă și conservatoare: recunoaște câteva tipare explicite (inclusiv afirmații de tip chemtrails și buletine repetitive) și păstrează restul ca `uncertain`. Nu descarcă pagini, nu inventează transcript și nu tratează întrebările drept afirmații.

DeepSeek este opțional și dezactivat implicit. Pentru activare sunt necesare explicit `DEEPSEEK_CLAIM_EXTRACTION_ENABLED=true`, cheia, modelul și `DEEPSEEK_CLAIM_MAX_CALLS_PER_RUN` ca întreg finit între 0 și 100. Ieșirea trebuie să respecte contractul JSON, să lege URL-ul/ID-ul/excerpt-ul de candidatul original și să nu inventeze text exact; erorile revin la clasificarea deterministă. Starea per candidat din migrarea 0007 împiedică repetarea extracției plătite când textul nu s-a schimbat. Nu există apel DeepSeek în teste.

Cheile de grupare cunoscute sunt înguste și includ polaritatea, entitatea și contextul. Două formulări românești ale afirmației despre aeronave pot fi grupate, dar o negare, o activitate agricolă sau o afirmație substanțial diferită nu este unită automat. Lead-urile incerte, buletinele, divertismentul și evenimentele ordinare sunt legate de candidat, pentru trasabilitate.

Workerul procesează incremental candidații noi sau actualizați într-un batch bounded și păstrează `claim_radar_candidate_state`. Pentru candidatele istorice, `runClaimRadarBackfill` este o operațiune repetabilă și idempotentă; se poate relua până când răspunde `complete=true`.

## YouTube și buget

Adaptorul folosește în continuare numai YouTube Data API oficial: maximum două `search.list` pe rulare, plus `videos.list` și chart-ul `mostPopular` existent. Acum păstrează `videoId`, `channelId`, `channelTitle`, query, modul de căutare și providerul API separat. Buletinele precum „Știrile de la ora 14” sunt păstrate brut, dar clasificate `generic_broadcast` și nu devin automat afirmații prioritare.

## M0.3C.2B — query generation și acoperire socială

Următorul milestone trebuie să:

1. construiască interogări din `claim_leads` testabile, sinonime aprobate și topicuri emergente, cu deduplicare, limită per rulare și jurnal al motivului/query-ului;
2. execute aceste query-uri prin adaptoare aprobate pentru YouTube, TikTok și Facebook/public indexes, fiecare cu coverage, termeni, dată și limitări proprii;
3. lege referințele noi de lead-uri existente numai când există evidence grounding și un matcher conservator; afirmațiile opuse rămân separate;
4. colecteze doar metrici publice oferite legal de provider și să păstreze observațiile timestamped, fără scraping, login bypass, estimări sau paid calls activate implicit;
5. adauge evaluări editoriale pentru false positives, recall/precision pe scenarii românești și controale de cost per provider.

TikTok și Facebook nu sunt active în M0.3C.2A. Contractul este în `packages/discovery/social-adapters.ts`; până la un provider/API aprobat, singurele fallback-uri sunt Social Intake și referințe public indexate observate cu limitările lor.
