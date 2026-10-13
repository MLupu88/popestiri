# RSS scheduler runbook

The hourly scheduler is an active host-level systemd timer on Hetzner. It starts the existing one-shot
worker in a disposable Docker container; it does not add a scheduler process, queue,
database, or application server. The worker's PostgreSQL advisory locks prevent
overlapping RSS and discovery batches, and the existing RSS deduplication, source isolation,
and provenance rules remain unchanged. Discovery runs after RSS with its own failure boundary.

The service is deliberately `Type=oneshot` and has no `Restart=` policy. A failed run is
visible in systemd and journald, while the next normal timer event is the next attempt.
This avoids an endless retry loop.

## Installation on Hetzner

Run these commands on the existing host after checking out the approved application
revision in `/opt/popestiri`. They install only the two scheduler units; they do not
change the running API, database, or any other stack.

```sh
cd /opt/popestiri
sudo install -o root -g root -m 0644 deploy/systemd/popestiri-rss-ingest.service /etc/systemd/system/popestiri-rss-ingest.service
sudo install -o root -g root -m 0644 deploy/systemd/popestiri-rss-ingest.timer /etc/systemd/system/popestiri-rss-ingest.timer
sudo systemd-analyze verify /etc/systemd/system/popestiri-rss-ingest.service /etc/systemd/system/popestiri-rss-ingest.timer
sudo systemctl daemon-reload
sudo systemctl enable --now popestiri-rss-ingest.timer
```

The service reads `.env.production` through Docker Compose. Do not put secrets in the
unit files or command line, and do not print `.env.production` while troubleshooting.

The same Compose `api` service environment is used by the hourly one-shot worker. In
particular, `DEEPSEEK_CLAIM_EXTRACTION_ENABLED`, `DEEPSEEK_CLAIM_MAX_CALLS_PER_RUN`,
`DEEPSEEK_API_KEY` and `DEEPSEEK_FAST_MODEL` are passed from `.env.production` to the
disposable `api` container. Their Compose defaults are `false`, `0`, and empty values,
so paid claim extraction remains disabled unless explicitly configured. The systemd
unit does not expose these values in its command line or logs.

## Verification

Confirm that the timer is enabled and has a next trigger:

```sh
sudo systemctl status --no-pager popestiri-rss-ingest.timer
systemctl list-timers --all popestiri-rss-ingest.timer
```

For an immediate smoke run, start the service once and inspect its result:

```sh
sudo systemctl start popestiri-rss-ingest.service
sudo systemctl status --no-pager popestiri-rss-ingest.service
```

The worker's operational JSON summaries are written to the journal. A successful run exits
0. A run with one or more source failures exits 1 after preserving successful sources;
the RSS JSON summary has `event: "rss_batch_import"` and `sourcesFailed > 0`. Discovery also emits
`event: "discovery_batch"`; its `status` may be `partial` when YouTube credentials are absent. Treat this as a
source-level/partial batch failure: inspect the affected source configuration or provider,
then allow the next hourly run or perform one deliberate manual retry.

A complete execution failure exits 1 without an `rss_batch_import` summary and logs
`RSS batch import failed before source processing.`. Treat this as an infrastructure or
worker startup problem (for example Docker, configuration, database connectivity, or a
pre-source database failure), not as a source-specific failure. Check the service and
Docker logs before retrying.

## Logs and monitoring

Show recent scheduler output, including the JSON summary:

```sh
sudo journalctl -u popestiri-rss-ingest.service --since "2 hours ago" --no-pager -o cat
sudo journalctl -u popestiri-rss-ingest.service -p warning --since "24 hours ago" --no-pager
```

Useful checks are the timer's `Next Elapse`, the service's `Result`, and the latest
`rss_batch_import` fields (`sourcesAttempted`, `sourcesSucceeded`, `sourcesFailed`,
`itemsRead`, `newArticles`, and `duplicates`). A non-zero service result is actionable;
do not hide it with a shell wrapper.

## Stop the timer

This prevents future hourly starts. It does not alter the API or database:

```sh
sudo systemctl disable --now popestiri-rss-ingest.timer
```

If a one-shot run is currently active and must be stopped, stop the service separately:

```sh
sudo systemctl stop popestiri-rss-ingest.service
```

## Rollback

To remove the scheduler while leaving the application stack untouched:

```sh
sudo systemctl disable --now popestiri-rss-ingest.timer
sudo systemctl stop popestiri-rss-ingest.service
sudo rm /etc/systemd/system/popestiri-rss-ingest.timer /etc/systemd/system/popestiri-rss-ingest.service
sudo systemctl daemon-reload
```

If the application revision is rolled back, leave the timer disabled until the checked-out
revision still contains the worker command and the production compose configuration. No
database rollback is needed for these unit files.
