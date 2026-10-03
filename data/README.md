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
- `build_meta` — build timestamps and adjustment notes

## Refresh

Re-run `bash scripts/install-price-database.sh` after updating `data/prices-manifest.json` with a new `sha256` and `download_url`.
