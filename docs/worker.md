# Workerul de import RSS

`apps/worker/ingest.ts` este un proces one-shot pentru importul tuturor surselor RSS active din
PostgreSQL. Reutilizează serviciul comun folosit de importul manual din admin.

## Local

Pornește PostgreSQL, aplică migrarea și configurează `DATABASE_URL` în `.env`, apoi:

```sh
pnpm install --frozen-lockfile
node --env-file=.env apps/worker/ingest.ts
```

Workerul citește numai sursele cu `platform='rss'` și `enabled=true`, importă cel mult două
fluxuri simultan și păstrează procesarea celorlalte surse când una eșuează. Un advisory lock
PostgreSQL împiedică două rulări batch simultane. O listă goală este un rezultat valid și nu
este o eroare.

Ieșirea este un singur obiect JSON operațional, de forma:

```json
{"event":"rss_batch_import","skipped":false,"sourcesAttempted":2,"sourcesSucceeded":2,"sourcesFailed":0,"itemsRead":10,"newArticles":8,"duplicates":2,"elapsedMs":1234}
```

Nu sunt tipărite URL-uri de feed, secrete sau erori brute de la furnizori. Codul de ieșire este
`1` dacă una sau mai multe surse au eșuat.

## Compose ulterior

Imaginea Docker existentă conține workerul. Pentru o rulare manuală în mediul compose, după ce
`migrate` este finalizat:

```sh
docker compose --env-file .env.production -f compose.production.yaml run --rm api node apps/worker/ingest.ts
```

Această comandă nu pornește rulări recurente și nu schimbă serviciile persistente. Pe Hetzner,
timerul systemd `popestiri-rss-ingest.timer` pornește workerul orar. Adminul și workerul folosesc
aceeași deduplicare `(source_id, canonical_url)`.
