# TikTok, Instagram și Facebook — fezabilitatea descoperirii publice

Document tehnic pentru M0.3C.1.1 și M0.3C.2B, verificat la 2026-10-11. Scopul este găsirea unor semnale publice care intră în inbox, nu măsurarea întregii platforme și nu verificarea afirmațiilor.

## Rezumat executiv

| Platformă | Calea oficială | Eligibilitate și acoperire | Cost / limite cunoscute | Recomandare PopeȘtiri |
| --- | --- | --- | --- | --- |
| TikTok | [Research API](https://developers.tiktok.com/products/research-api/) și [video query](https://developers.tiktok.com/doc/research-api-specs-query-videos/) | Acces aprobat pentru cercetare independentă; în Europa sunt eligibile anumite instituții academice și organizații nonprofit/independente. Nu este acces comercial general și nu acoperă automat tot ce devine viral. | TikTok nu publică un tarif per request pentru Research Tools. FAQ-ul indică o cotă zilnică de cercetare, iar pagina de rate limits indică limite pe fereastră pentru endpointurile video; cotele se verifică la aprobarea proiectului. Datele arhivate pot apărea cu întârziere de până la 48h, iar statisticile pot avea întârziere mai mare. | Verificare de eligibilitate și aplicare doar dacă entitatea și proiectul se califică. Pentru un MVP operațional, contractarea unui furnizor de social listening cu acoperire TikTok declarată și proveniență exportabilă este mai realistă decât presupunerea că Research API este disponibil. |
| Instagram | [Instagram Graph API](https://developers.facebook.com/docs/instagram-api/) pentru conturi profesionale | Necesită aplicație Meta, cont profesional eligibil, token și permisiuni/review; nu este motor de căutare pentru toate postările publice sau conturile personale. | Rate limits, permisiuni și câmpurile disponibile depind de produsul Meta și de review; lipsa unui rezultat nu dovedește lipsa conținutului. | Adaptor planificat după confirmarea permisiunilor și a dreptului de păstrare a URL-ului/provenienței. Fallback: provider conform, referințe indexate și Social Intake. |
| Facebook | [Graph API / Page Public Content Access](https://developers.facebook.com/docs/pages-api) pentru pagini permise; [Meta Content Library](https://transparency.meta.com/researchtools/meta-content-library) pentru cercetare | API-ul oficial este limitat de permisiuni, review și tipul obiectului. Accesul la Page Public Content nu înseamnă acces la profiluri, grupuri sau toate postările publice. Meta Content Library/API este orientată către cercetători eligibili și acces aprobat, prin ICPSR, nu către orice aplicație editorială. | Nu există tarif public simplu pentru acces general; costul este app review/compliance sau contractul furnizorului. Ratele Graph API depind de aplicație și produs și trebuie tratate ca limită de runtime, nu ca promisiune de volum. Ad Library API este utilă pentru reclame, nu pentru descoperirea generală a postărilor. | Începe cu o listă explicită de pagini publice de interes (redacții, instituții, organizații) prin API oficial, după review. Pentru căutare pe cuvinte-cheie în afara listei, evaluează un provider care declară în contract acoperirea Facebook. Nu pretinde acoperire pentru profiluri/grupuri/private sau platforma întreagă. |

## TikTok

Research API este singura cale oficială găsită care poate interoga conținut video public pe criterii de căutare. TikTok cere proiect aprobat, client key/client secret și token de acces; un cont de developer singur nu este suficient. Criteriile publicate exclud creatorii, advertiserii și utilizatorii comerciali ca atare. Pentru o redacție comercială, eligibilitatea trebuie confirmată în scris înainte de orice implementare.

PopeȘtiri a depus cererea pentru TikTok Research API, dar accesul NU este aprobat încă. Cererea în așteptare nu este credential și nu justifică activarea adaptorului. Orice date obținute ulterior printr-un proiect academic trebuie să rămână separate de pipeline-ul editorial public PopeȘtiri, cu excepția reutilizării autorizate explicit în scris și compatibile cu termenii, retenția și drepturile de redistribuire.

Datele sunt potrivite pentru un semnal de descoperire, cu câmpuri precum URL, creator, textul descrierii și timestamp-ul API. Nu trebuie tratate ca feed în timp real: documentația avertizează că indexarea video și statisticile pot fi întârziate. Nu vom calcula „viralitate” din câmpuri incomplete și nu vom descărca video, transcript sau comentarii fără o bază contractuală separată.

Alternativele conforme sunt:

- un furnizor comercial de social listening/brand monitoring care are contract și acces permis la TikTok; PopeȘtiri trebuie să ceară explicit acoperirea pentru România, dreptul de redistribuire a URL-urilor și timestamp/proveniență pentru fiecare rezultat;
- căutare prin referințe public indexate de motoare de căutare sau alerte de știri, păstrând rezultatul ca indiciu cu acoperire incompletă;
- Social Intake manual existent, folosit ca fallback pentru linkuri care nu apar în căile automatizate.

Prima integrare recomandată: un adaptor provider-first, cu contract și endpoint/documentație verificabile, care scrie doar URL, titlu disponibil, data observării, sursa providerului și limitările. Dacă PopeȘtiri obține ulterior aprobarea TikTok Research Tools, adaptorul oficial poate înlocui providerul fără a schimba contractul inboxului. Dependențele sunt credentialele providerului sau client key/client secret TikTok, o politică de retenție și un plafon de requesturi configurat; nu se adaugă încă niciun serviciu sau timer.

## Facebook

Pentru o aplicație editorială, Graph API nu este un motor general de căutare a tuturor postărilor publice. Calea realistă oficială este o allowlist de Facebook Pages publice, cu permisiunile și app review cerute de Meta. Rezultatele trebuie salvate cu Page ID, post ID/URL, timestamp API și câmpurile returnate; lipsa unui rezultat nu înseamnă că postarea nu există.

Meta Content Library/API oferă acces mai larg în context de cercetare publică, dar criteriile de eligibilitate și fluxul prin parteneri/ICPSR nu sunt o dependență sigură pentru PopeȘtiri. Meta Ad Library API poate acoperi reclame politice/sociale și reclame livrate în UE, dar nu este un substitut pentru feedul de postări și nu trebuie prezentat ca atare.

Prima integrare recomandată: API oficial pentru o allowlist mică de pagini publice, după app review, plus un provider contractual pentru căutare pe cuvinte-cheie dacă bugetul și termenii justifică acest lucru. Credentialele/dependențele sunt Meta App ID/secret, tokenul aprobat, permisiunea Page Public Content Access, lista de Page IDs și versiunea Graph API. Dacă review-ul nu este aprobat, rămân providerul conform, referințele indexate și Social Intake; nu se face scraping al Facebook.

## Instagram

Instagram este planificat pentru descoperire socială, dar nu este implementat. Calea oficială trebuie evaluată prin Instagram Graph API pentru conturi profesionale eligibile, cu Meta App, token, permisiuni și app review. Nu presupunem acces la conturi personale, căutare globală, Stories efemere sau conținut restricționat. Un adaptor viitor va păstra numai URL-ul disponibil, identificatorul contului/media, timestamp-ul furnizorului, câmpurile returnate și limitările de acoperire.

Fallback-urile sunt un provider contractual care declară acoperirea Instagram, referințe public indexate și Social Intake manual. Nu se face scraping și nu se inventează vizualizări, comentarii sau acoperire atunci când API-ul ori providerul nu returnează metadate.

## Criterii comune pentru selecția unui provider

Înainte de achiziție, furnizorul trebuie să confirme în scris: sursa și dreptul de acces, ce înseamnă „public”, țările și tipurile de conturi acoperite, latența, rate limits, retenția, exportul URL-ului original, identificatorii platformei, procedura pentru ștergeri și un cost lunar/pe volum. Providerul nu trebuie să inventeze engagement, să completeze câmpuri lipsă sau să transforme scorurile sale într-un verdict editorial.

M0.3C.1.1 și pilotul semantic nu activează TikTok, Instagram sau Facebook automat și nu schimbă Social Intake. Orice adaptor viitor va fi `unavailable`/`partial` cu limitarea explicită atunci când credentialele, review-ul sau providerul lipsesc. Tavily rămâne următoarea prioritate pentru retrieval de dovezi după validarea pilotului de extracție; nu este folosit pentru descoperire socială în acest milestone.
