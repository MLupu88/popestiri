# PopeȘtiri

Ziar zilnic automat în română. Ținta: colectare → grupare → selecție → verificare → redactare → fotografii → PDF A4 → imprimanta locală, în fiecare dimineață.

## Starea reală: M0.1 Foundation

Acest repository conține cod TypeScript executabil, contracte Zod, prima migrare PostgreSQL, validări editoriale, un mecanism de reluare a etapelor și teste. Nu este vechiul prototip HTML.

Funcționează acum: parsarea și validarea articolului, legăturile claim/evidence/verdict, verificarea fotografiei declarate, compunerea ediției JSON, migrarea testată pe PostgreSQL embedded (PGlite), reluarea etapelor în DB, API minimal protejat cu token și contractele pentru print. Nu există încă interfață Next.js, colectare live, apeluri AI, fotografii descărcate, renderer PDF, scheduler sau trimitere CUPS.

Node 24+ și pnpm sunt necesare. Versiunile efective sunt fixate în pnpm-lock.yaml.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm demo
```

Demo produce `output/edition.fixture.json`. Este blocat intenționat: fixture-ul nu are o fotografie reală cu utilizare aprobată. Nu apelează API-uri și nu imprimă nimic. Testele acoperă separat traseul validat, care nu este echivalent cu o ediție ready pentru print.

## PostgreSQL local

```sh
cp .env.example .env
# Schimbă POSTGRES_PASSWORD și DATABASE_URL cu aceeași parolă locală.
docker compose --env-file .env up -d db
node --env-file=.env packages/db/migrate.ts
```

Compose este destinat dezvoltării locale. Nu îl executa ca atare pe Hetzner: acolo trebuie pregătită configurația de rețea, port și volume în contextul serviciilor existente. Migrarea folosește tranzacție, lock și checksum; nu modificăm retroactiv migrările aplicate.

## API de fundație

Setează OPERATOR_TOKEN la minimum 24 de caractere în `.env`, apoi:

```sh
node --env-file=.env apps/web/server.ts
```

Ascultă doar pe 127.0.0.1:3100. `GET /health` verifică procesul, nu DB. `GET /api/providers` cere header Authorization Bearer și arată numai starea implementării conectorilor. Tokenul protejează administrarea fără un sistem de conturi publice.

## Surse și configurare

RSS, Google Trends RO, YouTube, TikTok, Deepgram, Tavily și DeepSeek fac parte din produs. Instagram este extensie prevăzută; pentru Facebook accesul trebuie evaluat. Interfețele sunt în packages/connectors; niciun provider nu este prezentat ca live. Cheile necesare sunt în .env.example, modelele DeepSeek se configurează separat. Pinterest nu este cerință.

## Următorul slice

Ingestie RSS reală, stocată în PostgreSQL și vizibilă prin API, cu deduplicare, erori izolate per sursă și usage/run logs. În paralel cu extinderea fluxului: prima probă PDF A4 cu fotografii reale utilizabile. UI Next.js va expune datele și acțiunile reale ale acestor servicii.

Vezi docs/architecture.md pentru deciziile complete și docs/print-spec.md pentru macheta tipografică.
