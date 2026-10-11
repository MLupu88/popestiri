# PopeȘtiri

Ziar zilnic automat în română. Ținta: colectare → grupare → selecție → verificare → redactare → fotografii → PDF A4 → imprimanta locală.

## Starea reală: M0.3C.1 — automated discovery foundation

Adminul oferă autentificare de operator, dashboard din PostgreSQL, inbox unificat de descoperiri,
configurarea surselor RSS, lista articolelor și inventarul integrărilor.
Paginile folosesc serverul Node existent și CSS separat; Next.js nu este încă introdus.
Fotografiile găsite în flux sunt păstrate ca referințe cu drepturi necunoscute.
Workerul batch importă toate sursele RSS active și rulează apoi descoperirea automată din registrul verificat,
cu maximum două fluxuri RSS simultan;
un flux eșuat nu oprește celelalte surse. Importurile individuale sunt jurnalizate în
`audit_events` și păstrează articolele ca neevaluate editorial.

Există și contractele Zod, politica editorială, migrarea PostgreSQL și mecanismul de reluare a etapelor.
Adminul include și Social Intake pentru linkuri publice Facebook, TikTok și YouTube: fiecare URL este păstrat ca neconfirmat, duplicatele păstrează proveniența, iar metadata poate fi completată doar manual. Nu există încă evaluare AI, selecție automată, renderer PDF, QR sau trimitere CUPS. Importul RSS este programat orar pe Hetzner printr-un timer systemd host-level.

Descoperirea automată folosește trei fluxuri RSS românești diversificate, Google Trends România prin exportul RSS public Trending Now și YouTube Data API când `YOUTUBE_API_KEY` este configurat. Lipsa cheii YouTube este raportată ca limitare; nu există scraping și nu se inventează metrici.
Rezultatele YouTube separă căutarea recentă de chart-ul oficial `mostPopular` pentru România. Pentru verificarea directă a fluxurilor RSS și Google Trends se poate rula `pnpm discovery:validate`.

## Pornire locală

Node 24+ și pnpm. PostgreSQL trebuie să fie pornit, migrarea aplicată,
iar DATABASE_URL și OPERATOR_TOKEN configurate în fișierul local `.env`.

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
PORT=0 node --env-file=.env apps/web/server.ts
```

PORT=0 cere un port liber. Deschide adresa localURL afișată la pornire.
Vezi [ghidul admin](docs/admin.md) pentru autentificare și detaliile importului.
Pentru importul batch vezi [ghidul workerului](docs/worker.md).
Pentru programarea orară pe Hetzner vezi [runbook-ul schedulerului RSS](docs/rss-scheduler.md).
Compose-ul local poate aloca dinamic portul PostgreSQL; DATABASE_URL trebuie să corespundă
portului raportat de `docker compose port db 5432` după recrearea containerului.

## Producție

Flux: Mac → GitHub → Hetzner. Folosește exclusiv compose.production.yaml.
API-ul ascultă în container pe 3100; PostgreSQL nu publică port pe server.
Nginx Proxy Manager trimite domeniul către popestiri-api:3100.
[Instrucțiuni de deploy](docs/deployment.md).

`/health` verifică procesul. `/ready` verifică DB și migrarea.
`/api/providers` necesită Authorization Bearer și nu expune secrete.

## Demo editorial

`pnpm demo` produce output/edition.fixture.json. Este blocat intenționat:
fixture-ul nu are fotografie reală aprobată. Nu apelează servicii și nu imprimă.

## Ce urmează

Evaluarea și gruparea articolelor, verificarea cu dovezi, fotografii utilizabile,
prima ediție PDF A4 și apoi automatizarea zilnică împreună cu agentul de print.
Sursele sociale și ceilalți furnizori vor fi conectați incremental.

Vezi [arhitectura](docs/architecture.md) și [specificația de print](docs/print-spec.md).
Pentru fluxul de linkuri sociale vezi [Social Intake](docs/social-intake.md).
Pentru colectarea automată vezi [Automated Discovery](docs/discovery.md).
