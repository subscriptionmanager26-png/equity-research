# Nifty Total Market price database

Cloud Agent environments install a local SQLite copy of the Nifty Total Market ~2Y NSE bhavcopy during `scripts/install-agent-env.sh`.

| Resource | URL |
|---|---|
| Manifest | https://swz2aawt4rtld4wq.public.blob.vercel-storage.com/prices/manifest.json |
| Database (gzip) | https://swz2aawt4rtld4wq.public.blob.vercel-storage.com/prices/nifty-total-market-2y.sqlite.gz |
| App proxy | https://momentum-screen-builder-app.vercel.app/api/prices/manifest |

## Installed path

```
$HOME/.local/share/equity-research/prices/nifty-total-market-2y.sqlite
```

The install script also writes `$HOME/.local/share/equity-research/prices/PRICES_DB_PATH` with the resolved path.

## Tables

- `eod_adjusted` — corporate-action adjusted closes (preferred for returns/screens)
- `eod_raw` — raw NSE bhavcopy closes
- `ca_cache` — corporate-action payloads per symbol
- `symbol_metrics` — per-symbol summary metrics from the build pipeline
- `build_meta` — build timestamps and adjustment notes

## Refresh

After republishing the blob, sync the repo manifest from the published source of truth:

```bash
bash scripts/sync-prices-manifest.sh
bash scripts/verify-prices-manifest.sh
```

Then re-run `bash scripts/install-price-database.sh` in agent environments (or trigger a new environment build).

CI runs `scripts/verify-prices-manifest.sh` on changes to `data/prices-manifest.json` or price install scripts.
