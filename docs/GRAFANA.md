# Postify Grafana Dashboards

Prometheus endpoint: `https://postify.applabx.com/api/metrics` (scrape via
Cloudflare origin fallback if the scraper's egress is bot-challenged).

## Metric reference

| Metric | Type | Labels |
|---|---|---|
| `postify_publish_posts_total` | counter | result (PUBLISHED/PARTIAL/FAILED) |
| `postify_publish_targets_total` | counter | platform, result |
| `postify_queue_jobs` | gauge | state (waiting/active/delayed/completed/failed/paused) |
| `postify_worker_info` | gauge | id, version |
| `postify_worker_jobs_processed_total` | gauge | id |
| `postify_oauth_attempts_total` | counter | platform, phase, result |
| `postify_api_requests_total` | counter | route, method, status |
| `postify_api_duration_seconds` | histogram | route |
| `nodejs_process_memory_bytes` | gauge | type (rss/heapUsed/heapTotal/external) |
| `nodejs_process_cpu_seconds_total` | gauge | — |
| `postify_redis_up` | gauge | — |
| `postify_postgres_up` | gauge | — |

## Recommended panels

1. **Publish success rate** (stat): `sum(rate(postify_publish_posts_total[1h]))`
   split by `result`; alert when `result="FAILED"` rate > 0.1/min.
2. **Per-platform failures** (bar): `rate(postify_publish_targets_total{result="failure"}[1h])`
   by `platform` — alert on any platform sustained > 5/min.
3. **Queue depth** (timeseries): `postify_queue_jobs` by state; alert when
   `waiting` > 100 for 10 min (worker starvation) or `failed` increasing.
4. **Workers** (table): `postify_worker_info` + `postify_worker_jobs_processed_total`
   + `time() - postify_worker_last_heartbeat_seconds`-style freshness;
   alert when count < expected replicas.
5. **OAuth failures** (timeseries): `rate(postify_oauth_attempts_total{result!="success"}[1h])`
   by platform, phase.
6. **API latency p95** (timeseries): `histogram_quantile(0.95, sum(rate(postify_api_duration_seconds_bucket[5m])) by (le, route))`.
7. **Memory** (timeseries): `nodejs_process_memory_bytes{type="rss"}` — alert
   on sustained growth (leak detection; worker RSS is also in worker heartbeats).
8. **CPU** (timeseries): `rate(nodejs_process_cpu_seconds_total[1m])`.
9. **Dependencies**: `postify_redis_up`, `postify_postgres_up` (stat).

## Scrape config

```yaml
scrape_configs:
  - job_name: postify
    metrics_path: /api/metrics
    scheme: https
    static_configs:
      - targets: ["postify.applabx.com"]
```

If the scraper runs in a datacenter and receives Cloudflare bot-challenges,
scrape the origin directly:

```yaml
    static_configs:
      - targets: ["178.105.157.205"]   # origin IP; Host header required
    proxy_url: ""                      # direct
    tls_config: { server_name: postify.applabx.com }
```
