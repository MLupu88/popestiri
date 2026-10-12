# M0.3C.2A — Viral Claim Radar Foundation

PopeȘtiri descoperă mai întâi afirmații publice verificabile, apoi le poate trimite în fluxul editorial de verificare. O afirmație din radar nu este un verdict și nu este copiată în `claims`; acea tabelă rămâne parte din fluxul de verificare cu dovezi.

## Ce se păstrează

- `discovery_candidates` rămâne inboxul brut, cu proveniența adapterului.
- `claim_leads` păstrează afirmația extrasă, textul exact disponibil, parafraza automată când există, clasificarea, metoda/modelul/versiunea și limitele.
- `claim_lead_references` păstrează fiecare candidat, URL, publisher/channel, platformă, metoda de discovery și timpii de publicare/observare. Referințele diferite nu sunt dovadă independentă una pentru cealaltă.
- `claim_observations` este append-only și păstrează măsurători timestamped. Pentru YouTube se salvează doar `viewCount` și `commentCount` returnate de API. RSS, rankul de căutare și numărul de publicații nu sunt transformate în reach.

Un singur punct de date este afișat ca **insufficient history**. Schimbarea observată se calculează doar între măsurători comparabile ale aceluiași lead și aceleiași metrici. Lipsa câmpului este afișată ca indisponibilă, nu ca zero.

## Extracție și grupare

`packages/claims/extractor.ts` oferă un contract Zod strict. În configurația implicită, clasificarea este deterministă și conservatoare: recunoaște câteva tipare explicite (inclusiv afirmații de tip chemtrails și buletine repetitive) și păstrează restul ca `uncertain`. Nu descarcă pagini, nu inventează transcript și nu tratează întrebările drept afirmații.

DeepSeek este opțional și dezactivat implicit. Pentru activare sunt necesare explicit `DEEPSEEK_CLAIM_EXTRACTION_ENABLED=true`, cheia, modelul și `DEEPSEEK_CLAIM_MAX_CALLS_PER_RUN>0`. Ieșirea trebuie să fie JSON valid, cu evidence grounding; erorile revin la clasificarea deterministă. Nu există apel DeepSeek în teste.

Cheile de grupare cunoscute sunt înguste și includ polaritatea. Două formulări românești ale afirmației despre aeronave pot fi grupate, dar o negare sau o afirmație substanțial diferită nu este unită automat. Lead-urile incerte sunt legate de candidat, pentru trasabilitate.

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
