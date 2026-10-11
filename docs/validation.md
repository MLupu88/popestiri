# Verificare M0.1

9 octombrie 2026.

- pnpm install: dependențe instalate și lockfile creat.
- pnpm typecheck: trecut.
- pnpm test: 11 teste trecute.
- PostgreSQL: migrarea executată pe PGlite, cu verificări de constrângeri și reluare a etapelor. Docker/PostgreSQL pe server nu au fost executate.
- API smoke: health 200, request neautorizat 401, inventar de conectori autorizat 200.
- pnpm demo: ediție fixture blocată corect din lipsa fotografiei aprobate; zero PDF și zero print.

Nu s-a verificat conectarea live la surse, generarea PDF sau imprimanta din acest workspace.
Programarea RSS este activă pe Hetzner prin timer systemd; verificarea operațională se face
conform runbook-ului schedulerului.
