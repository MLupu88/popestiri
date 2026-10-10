# M0.2 — Admin și import manual RSS

Această versiune extinde serverul existent cu pagini renderizate pe server și CSS separat.
Nu este un mockup: sursele, articolele și jurnalul de import sunt persistate în PostgreSQL.
Nu introduce o migrare nouă și nu modifică migrarea deja aplicată.

## Pornire pe Mac

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
PORT=0 node --env-file=.env apps/web/server.ts
```

PORT=0 cere un port liber sistemului de operare. Deschide `localURL` afișat la pornire.
Folosește OPERATOR_TOKEN din `.env` local. Nu îl posta în chat, nu îl pune în URL.
Pentru a-l copia direct în clipboard pe Mac, din alt terminal în directorul proiectului:

```sh
node --env-file=.env -e 'process.stdout.write(process.env.OPERATOR_TOKEN)' | pbcopy
```

Pe producție cheia este alta, cea generată în `/opt/popestiri/.env.production`.
Cookie-ul de sesiune este HttpOnly, SameSite=Strict și Secure în producție; expiră după 8 ore.
Formularele modificatoare cer Origin valid și token CSRF legat de sesiune.
După 20 de încercări de autentificare greșite într-o fereastră de 15 minute, login-ul este temporar limitat.
Limita este globală pentru instanță, fără a avea încredere în X-Forwarded-For.
Rotirea OPERATOR_TOKEN invalidează toate sesiunile existente; logout șterge cookie-ul din browser.

## Comportament

- `/` redirecționează către `/login` sau `/admin`.
- `/admin`: numere reale și edițiile live existente. Nicio ediție fictivă creată.
- `/admin/sources`: adăugare, activare/dezactivare și import manual RSS/Atom HTTPS.
- `/admin/articles`: titlu, extras furnizat de flux, dată, sursă, link la fotografie dacă există; filtrare și paginare.
- `/admin/integrations`: inventarul implementării, fără expunerea cheilor.
- `/api/providers` păstrează autentificarea Bearer și răspunde 401 fără token.
- `/health` verifică procesul; `/ready` verifică accesul la DB și prezența migrării 0001.
- Logo-ul alb este încărcat din `assets/popestiri-logo-white.png`; originalul JPEG este fallback.

## Limitele importului

Maximum 2 MB, 15 secunde, 3 redirecturi și 100 de articole valide din primele 200 intrări.
Fiecare destinație este verificată înaintea conexiunii; IP-ul IPv4 public este fixat pentru acea conexiune.
Sunt blocate localhost, rețele private/speciale, IPv6, porturi personalizate, URL-uri cu credențiale și XML cu DTD/entity declarations.
Codificarea XML acceptată este UTF-8; fluxurile comprimate împotriva cererii identity nu sunt acceptate.
Două importuri pot rula simultan per proces. Importurile nu au încă joburi persistente sau programare automată.
Tranzacția DB salvează articolele, rezultatul importului și auditul împreună.
Același URL din aceeași sursă nu se inserează de două ori. Gruparea aceluiași eveniment între publicații urmează separat.
Importul repetat nu suprascrie textul original deja salvat.
Fotografiile din RSS sunt doar referințe cu rightsStatus=unknown. Nu sunt descărcate sau aprobate automat.
Nu sunt preluate imagini din paginile articolelor dacă lipsesc din flux.

## Ce nu este încă implementat

Scoruri editoriale, verificare cu DeepSeek/Tavily, selecția articolelor în ediție,
aprobarea și prelucrarea imaginilor, generarea PDF A4, QR, cron și agentul de print.
Nici prezența unei chei în mediu, nici importul RSS nu înseamnă că aceste etape funcționează.

## Verificări

Typecheck și 17 teste: reguli editoriale existente, DB, reluarea etapelor,
autentificare HTTP, cookie/CSRF, expirare și alterarea sesiunii, URL-uri private,
RSS/Atom, HTML neexecutabil, proveniența fotografiei și import fără duplicate.
Verificarea unui flux real și verificarea vizuală în browser trebuie făcute pe Mac/server;
mediul de pregătire nu a avut acces DNS la publicație, iar browserul de test nu a putut fi descărcat.

## Deploy

Păstrează fluxul Mac → commit/push → checkout al SHA-ului pe server → build/recreate.
Include logo-ul alb în commit; Dockerfile copiază acum directorul assets în imagine.
În `.env.production` actualizează doar APP_VERSION la SHA-ul nou, păstrând secretele.
Folosește exclusiv compose.production.yaml. Rețeaua, volumul DB și upstream-ul NPM rămân aceleași.
După pornire verifică `/ready`, redirecționarea `/` la `/login`, autentificarea,
crearea unei surse și importul ei de două ori (al doilea import nu dublează articolele).
