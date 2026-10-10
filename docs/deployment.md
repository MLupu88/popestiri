# Deploy de fundație pe Hetzner

Flux: modificări pe Mac → verificare → commit/push GitHub → checkout pe server.
Acest deploy oferă API-ul M0.1 și PostgreSQL, nu încă interfața admin sau ziarul.

## Configurație

Folosește exclusiv `-f compose.production.yaml`, nu combina cu compose.yaml de dezvoltare.
Nu există porturi publicate pe host. PostgreSQL este doar în rețeaua backend internă.
API-ul este disponibil proxy-ului existent la `http://popestiri-api:3100`.
Rețeaua externă implicită este `n8n_network`; verifică numele pe server înainte de pornire.
Nu modifica celelalte stack-uri și nu elimina volumele.

Pe server creează `.env.production` cu permisiuni 0600 și secrete NOI:
`POSTGRES_PASSWORD` (48 caractere hex), `OPERATOR_TOKEN` (64 caractere hex),
`PROXY_NETWORK` și `APP_VERSION` (SHA-ul commitului instalat).
Parola hex evită caractere ce necesită codificare în DATABASE_URL.
Nu copia secretele locale pe server și nu comite fișierul.

## Pornire după verificarea serverului și checkout

```sh
docker compose --env-file .env.production -f compose.production.yaml config --quiet
docker compose --env-file .env.production -f compose.production.yaml up -d --build --wait api
docker compose --env-file .env.production -f compose.production.yaml ps -a
docker compose --env-file .env.production -f compose.production.yaml exec -T api node -e "fetch('http://127.0.0.1:3100/health').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
docker compose --env-file .env.production -f compose.production.yaml exec -T db psql -U popestiri -d popestiri -c 'SELECT id, applied_at FROM schema_migrations;'
```

API-ul pornește numai după migrarea reușită. `/health` verifică procesul, nu baza de date;
verificarea SQL de mai sus confirmă separat migrarea. `/api/providers` cere Bearer token.
După verificări, schimbă upstream-ul domeniului în Nginx Proxy Manager către
`http`, `popestiri-api`, port `3100`, păstrând certificatul existent.
Notează upstream-ul vechi pentru revenire înainte de schimbare.
Verifică `/health` prin HTTPS și răspunsul 401 al `/api/providers` fără token.
Pagina `/` nu are încă interfață și răspunde 401 fără token.

## Actualizări

Înaintea modificărilor de schemă: backup verificat al bazei de date.
Folosește un checkout curat al commitului testat și APP_VERSION egal cu acel SHA.
Imaginea precedentă poate fi refolosită numai dacă schema rămâne compatibilă;
nu presupune că revenirea codului inversează migrările.
Prima migrare este tranzacțională, cu blocare și checksum.
