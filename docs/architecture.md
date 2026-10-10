# Arhitectură și decizii — 9 octombrie 2026

Sursa de produs: brief-ul original din [main] actual.verificat/Pasted text.txt, modificările ulterioare privind numele PopeȘtiri, motorul PDF înlocuibil și fotografia obligatorie pentru fiecare articol. Destinația cunoscută: popestiri.aiexperiments.eu pe Hetzner. Nu s-a efectuat deploy din acest workspace.

## Componente

- apps/web: API și, ulterior, Next.js pentru admin și paginile publice accesate prin QR.
- apps/worker: pipeline programat; proces separat de cererile web. În M0.3A există workerul
  one-shot de import RSS; schedulerul rămâne neimplementat.
- apps/print-agent: agent macOS/Linux care preia ediția ready și folosește CUPS/lp.
- packages/core: contracte Zod, reguli editoriale și selecție.
- packages/db: PostgreSQL, Drizzle, migrări și checkpoint-uri.
- packages/connectors: interfețe furnizori; implementările urmează.
- packages/newspaper: contract PdfRenderer și specificație A4; implementarea rendererului urmează.
- packages/media: modul planificat pentru assete, verificarea fotografiilor și decupaje.

## Flux țintă

Colectare → normalizare → deduplicare → clustering → attention/relevance/verification priority separate → shortlist → captions/STT selectiv → afirmații → research Tavily → dovezi → verdict → redactare DeepSeek → fotografie → compoziție ediție → PDF → preflight → ready → print local.

Nu există ponderi numerice de ranking aprobate; nu inventăm o formulă prezentată ca decizie istorică. Nu presupunem că social media este falsă. Nu impunem un număr de debunk-uri. Nu afișăm procente de adevăr. Un verdict este despre o afirmație, nu despre întreaga platformă sau popularitatea articolului.

## Automatizare

Ținta configurabilă: 05:15 pornire, 06:30 ediție disponibilă, aproximativ 07:00 print. Europe/Bucharest gestionează DST. Schedulerul poate fi n8n sau alt trigger; regulile stau în cod. O singură execuție logică per dată/regiune și revizie, cu retry pe etape. Schedulerul nu este încă implementat.

Importul RSS batch folosește serviciul comun cu adminul, citește doar sursele active din PostgreSQL,
ține un advisory lock PostgreSQL pentru a evita două batch-uri simultane și limitează concurența la două
fluxuri. Un eșec este înregistrat per sursă și nu oprește celelalte importuri.

Pipeline_runs și stage_runs permit checkpoint și reluare. Implementarea curentă folosește lease de 5 minute; etapele lungi vor necesita heartbeat. Un apel extern poate fi repetat dacă procesul moare înainte să salveze rezultatul; nu pretindem exact-once pentru API-uri. Introducem dedup și limite de consum la conectori. UsageLedger păstrează costuri necunoscute ca null, nu ca zero.

## Publicare și print

Draft → validated → rendered → ready. Validated înseamnă că metadatele trec regulile, nu că există PDF sau fișiere media. Rendererul verifică existența efectivă a fotografiei, checksum, dimensiuni, DPI și paginarea. Doar PDF-ul validat poate deveni ready. Prima politică de implementare cere pentru concluzii sensibile o sursă primară și dovezi din minimum două grupuri de proveniență independente declarate. Acesta este un prag inițial explicit, nu o garanție că verdictul este corect; comparația efectivă a dovezilor rămâne de implementat. Independența surselor nu se deduce din numărul URL-urilor. Pipeline-ul poate accepta automat cazurile eligibile; adminul permite intervenții fără să fie obligatoriu zilnic.

Publicațiile păstrează snapshot-uri de articol și referințe la versiunile verificării. Override-urile vor cere motiv și audit. Serviciul de publicare va scrie aceste elemente într-o tranzacție; acel serviciu nu este încă implementat.

Agentul local inițiază conexiunea spre backend. Persistă request_id și checksum înainte de CUPS; retry păstrează request_id. Reprint explicit creează alt request_id. Starea submitted nu înseamnă pagini ieșite fizic. La rezultat necunoscut după crash se reconciliază jobul CUPS, nu se retrimite orbește.

## Stocare și acces

PostgreSQL pentru date; volum persistent pentru media și PDF, cu copii de siguranță. Chei numai server-side. Fără conturi publice/plăți. Admin protejat cu token inițial, apoi acces operator potrivit deploy-ului. Worker cu concurență limitată pe serverul partajat. Obiectele externe sunt conținut neîncrezut, nu instrucțiuni pentru AI; răspunsurile AI sunt validate structural și editorial.
