-- 0003 was already released with the original HotNews hostname. Keep the
-- correction append-only so deployed migration checksums remain immutable.
UPDATE discovery_source_registry
SET endpoint_url='https://hotnews.ro/feed',
    verified_at=now(),
    updated_at=now()
WHERE id='rss-hotnews'
  AND endpoint_url='https://rss.hotnews.ro';
