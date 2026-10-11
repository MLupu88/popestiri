import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const service = await readFile(new URL('../deploy/systemd/popestiri-rss-ingest.service', import.meta.url), 'utf8');
const timer = await readFile(new URL('../deploy/systemd/popestiri-rss-ingest.timer', import.meta.url), 'utf8');

test('RSS systemd service runs the production one-shot worker from the deployment directory', () => {
  assert.match(service, /^Type=oneshot$/m);
  assert.match(service, /^WorkingDirectory=\/opt\/popestiri$/m);
  assert.match(service, /^ExecStart=\/usr\/bin\/docker compose --env-file \.env\.production -f compose\.production\.yaml run --rm --no-deps api node apps\/worker\/ingest\.ts$/m);
  assert.match(service, /^StandardOutput=journal$/m);
  assert.match(service, /^StandardError=journal$/m);
  assert.match(service, /^SyslogIdentifier=popestiri-rss-ingest$/m);
  assert.doesNotMatch(service, /^Restart=/m);
});

test('RSS systemd timer is hourly, persistent, and has no retry loop', () => {
  assert.match(timer, /^OnCalendar=hourly$/m);
  assert.match(timer, /^Persistent=true$/m);
  assert.match(timer, /^Unit=popestiri-rss-ingest\.service$/m);
  assert.match(timer, /^WantedBy=timers\.target$/m);
  assert.doesNotMatch(timer, /^OnUnitActiveSec=/m);
  assert.doesNotMatch(timer, /^Restart=/m);
});

