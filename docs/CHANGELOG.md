# PopeȘtiri — CHANGELOG / DECISION LOG

**Regulă:** istoric append-only. Pentru orice schimbare funcțională, actualizează acest jurnal + [roadmap.md](roadmap.md) + [PROJECT_STATUS.md](PROJECT_STATUS.md) în același PR. Fiecare intrare conține data, milestone, motiv, PR/SHA, teste, deploy și follow-up; nimic nu se declară „deployed” fără dovadă.

## 2026-11-02 — Corectare fixture de teste dependentă de dată (PR #14)
- CI inițial #14: 65/68 teste passed, 3 failed în tests/discovery.test.ts deoarece fixture-ul `candidate()` folosea 2026-10-11, în afara ferestrei `now() - interval '7 days'` la 2026-11-02.
- Modificat exclusiv fixture-ul `candidate()` să creeze date observate relativ la timpul rulării (24h în urmă), păstrând datele fixe doar în testele deliberate de distanțe temporale. NU se schimbă logica produsului și nu se fac migrări sau deploy.
- Necesită confirmarea rerulării CI pe commitul corectat; nu afirma 68/68 înaintea rezultatului.

## 2026-11-02 — Audit / proiect de continuitate (în PR, nu încă în main sau pe server)
- Audit static GitHub la HEAD `e181e33`, raport de evidență separat de ceea ce a fost observat în producție la 2026-10-13.
- Roadmap v2 realiniat la **automatic viral debunking**, fără dependență de community submissions.
- Propuneri de documentație: status, audit, working agreement, runbook Hetzner, instrucțiuni Codex/Claude Code și guard CI pentru roadmap/status/changelog.
- **Nicio acțiune efectuată pe Hetzner.** Acest PR cere review/merge înainte de sincronizarea checkoutului pe server.

## 2026-10-13 — PR #13 (merge `e181e3329c5ba4498478b501e9ef6d8d4a8261ce`)
- Semantic pilot: protecție polaritate RO, contorizare API usage unknown, origine extracție, migrare aditivă `0010`.
- Codex: typecheck, semantic 12/12, full 68/68; GitHub CI passed.
- Loguri operator: backup PostgreSQL 733 KB (lista pg_restore citibilă), build imagine, aplicare migrări 0008–0010, API la `e181e33` healthy, /health HTTP 200, DeepSeek automat dezactivat și max calls 0, timer RSS repornit.
- Pilotul de 20 de articole **nu are rezultat primit**; status PENDING.

## 2026-10-13 — PR #11–12
- Pilot semantic independent, aserțiuni multiple, preview/dry-run/apply, cache și limite de cost; migrări 0008–0009. PR #12 a fost integrat înainte de corecțiile finale reluate în PR #13.

## 2026-10-13 — PR #10
- Viral Claim Radar Foundation cu `claim_leads`, provenance, observații și admin `/admin/claims`.

## 2026-10-11 — PR #7–9
- Discovery automat: RSS, Google Trends RO, YouTube Data API opțional, inbox și grupare lexicală.

## 2026-10-10–11 — PR #1–6
- Admin, ingestie RSS, systemd timer, Social Intake manual, hardening și teste.