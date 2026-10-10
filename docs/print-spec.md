# PopeȘtiri — specificație pentru prima probă de tipar

Format: A4 portret 210 × 297 mm, maximum 4 pagini, duplex pe muchia lungă. Nu completăm pagini artificial. Fiecare articol primește fotografie, legendă și credit. Această regulă nouă înlocuiește imaginile opționale din brief-ul inițial.

Propunere de probă: margini 12 mm, trei coloane, text 10–10,5 pt, titlu principal 26–32 pt, titluri secundare 16–20 pt, legende 8–9 pt. Toate dimensiunile se confirmă la imprimare 100%, nu doar în browser. Fotografie principală lată de două coloane; secundare de o coloană; Flash Global cu thumbnails lizibile. Cerință inițială 200 DPI efectivi, țintă 300 DPI. Nu se mărește artificial imaginea pentru a pretinde rezoluție.

1. CE TREBUIE SĂ ȘTII AZI: lead + 2–3 subiecte secundare, fotografie dominantă, ierarhie editorială.
2. CE VEDE ROMÂNIA: interes public și trenduri, fără a forța verdict factual pe opinie sau divertisment.
3. CE NU E CHIAR CUM PARE: verificări documentate; dacă lipsesc, conținut contextual eligibil.
4. FLASH GLOBAL: 6–8 subiecte, 40–60 cuvinte fiecare, fotografie mică.

Articolul: titlu, deck scurt, rezumat, de ce contează unde ajută, verdict unde e aplicabil, surse, verificat la, fotografie cu credit/legendă și QR către dosar. URL-uri lungi nu se tipăresc. Pagina de QR trebuie publicată odată cu PDF-ul și să păstreze contextul ediției.

Logo: fișierul furnizat de utilizator este păstrat în assets ca referință. Pregătirea unei variante de masthead curate și tipărirea ei la dimensiunea reală fac parte din prima probă. PDF-ul nu va avea fundal crem imprimat pe întreaga pagină; albul hârtiei reduce consumul de cerneală.

Compoziția editorială precedă rendererul. Pornim cu un PdfRenderer Chromium; evaluăm Paged.js ori alt motor dacă paginarea nu trece probele. Un provider de layout este permis. Layout-ul nu este decis liber de LLM.

Preflight obligatoriu înainte de ready: maximum 4 A4; fotografii existente și aprobate; rezoluție la dimensiunea de print; fonturi încorporate; diacritice; text complet; fără suprapuneri; fără titluri orfane; QR scanabil; credite; funcționare alb-negru și duplex. Nu tăiem text și nu micșorăm automat fontul. Recompunem, scurtăm editorial cu reverificare sau scoatem articolul. Dacă problema rămâne, ediția se blochează înainte de print.

Stare: specificație și contract în cod; niciun PDF verificat vizual sau fizic nu a fost produs în M0.1.
