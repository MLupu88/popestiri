# PopeȘtiri — HETZNER SERVER RUNBOOK

**Ultima observare reală:** 2026-10-13, din logurile operatorului. **Nu s-a făcut conexiune la server în auditul 2026-11-02.**

## Identificare

| Cheie | Valoare |
|---|---|
| Provider | Hetzner |
| IPv4 | **88.99.81.51** |
| Hostname observat | **ubuntu-4gb-fsn1-1** |
| Hetzner numeric Cloud ID | **NECONFIRMAT**; nu confunda cu IP |
| SSH | ssh root@88.99.81.51 (acces autorizat) |
| Repository | MLupu88/popestiri |
| Folder | /opt/popestiri |
| Domeniu | https://popestiri.aiexperiments.eu |
| Prod compose | compose.production.yaml |
| Compose project | popestiri-production |
| API upstream NPM | popestiri-api:3100 |
| Proxy network | n8n_network (partajată) |
| DB | postgres:18-alpine, volum persistent postgres-data |
| Timer | popestiri-rss-ingest.timer |
| One-shot service | popestiri-rss-ingest.service |
| Backup folder observat | /root/backups/popestiri |
| Prod secrets | /opt/popestiri/.env.production, niciodată afișat |
| Printer | Epson L5390 în LAN, agent încă neimplementat |

**Serverul este partajat. Nu executa reboot, docker compose down -v, system prune sau comenzi pe alte proiecte fără aprobare explicită.**

## Calea oficială a schimbării

1. Codex / Claude Code într-un branch local → teste + roadmap/status/changelog.
2. GitHub PR → CI + review → merge → SHA complet de release.
3. Audit read-only pe server, compară SHA-ul live și versiunea nouă; backup DB dacă sunt migrări.
4. Oprește numai timerul PopeȘtiri; verifică dacă one-shot worker este în execuție.
5. Checkout commit aprobat din main, worktree clean, Compose config --quiet, build imagine tag SHA.
6. Aplică migrări NOI aprobate, verifică schema_migrations; nu modifica migrări istorice.
7. Actualizează doar APP_VERSION în .env.production fără a imprima restul configurației; recreate doar api cu --no-deps, așteaptă healthy.
8. Verifică /health, /ready, DB, Docker image, login/admin și funcția nouă; repornește timerul și examinează logurile.
9. PR în GitHub post-deploy pentru SHA, data exactă, verificări, erori, status și next step; sincronizează documentele prin checkout Git fără editări manuale pe server.

## Audit READ-ONLY (nu tipărește .env.production)

~~~bash
cd /opt/popestiri || exit 1
git status --short
git rev-parse HEAD
docker compose --env-file .env.production -f compose.production.yaml ps
curl -fsS https://popestiri.aiexperiments.eu/health
curl -fsS https://popestiri.aiexperiments.eu/ready
docker compose --env-file .env.production -f compose.production.yaml exec -T db \
  psql -U popestiri -d popestiri -c 'SELECT id, applied_at FROM schema_migrations ORDER BY id;'
systemctl is-active popestiri-rss-ingest.timer || true
systemctl list-timers --all --no-pager popestiri-rss-ingest.timer
journalctl -u popestiri-rss-ingest.service --since '24 hours ago' --no-pager -o cat
~~~

Nu executa docker compose config fără --quiet și nu expune loguri brute care pot conține date sensibile.

## Preview semantic fără apeluri plătite

~~~bash
cd /opt/popestiri || exit 1
docker compose --env-file .env.production -f compose.production.yaml \
  run --rm --no-deps api node apps/worker/claim-pilot.ts --preview --limit=20
~~~

Nu rula --paid fără aprobare buget și metodologie.

## Backup și rollback

- Backup PostgreSQL pg_dump -Fc înaintea migrațiilor; validează arhiva și testează restaurarea într-un mediu separat.
- Migrațiile sunt append-only; rollback-ul imaginii NU inversează schema.
- Înainte de schimbări, notează imaginea live și statusul timerului. Nu atinge proxy network sau volume partajate.
- Dacă live smoke fail, oprește schimbarea și planifică recovery compatibil cu schema; nu reporni automat un worker incompatibil.

## Continuity after deploy

În aceeași zi creează PR docs-only pentru roadmap/status/changelog cu SHA-ul real, timestamp, /ready, schema, timer, smoke test, blocaje, next step. După merge sincronizează documentele pe server folosind Git; nu afirma că sunt deja prezente până la verificarea checkout-ului.