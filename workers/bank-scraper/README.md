# Building bank scraper worker

Runs `israeli-bank-scrapers` (Chromium) **outside** Vercel Functions, then returns normalized transactions to BINO for ingest + match.

## Run locally

```bash
# from repo root (uses root node_modules/israeli-bank-scrapers)
export BUILDING_BANK_SCRAPER_WORKER_SECRET='change-me'
export BUILDING_BANK_SCRAPER_SHOW_BROWSER=true   # optional, for OTP banks
npm run worker:bank-scraper
# → http://127.0.0.1:8787
```

## Point BINO at the worker

In `.env.local` / Vercel:

```bash
BUILDING_BANK_SCRAPER_SYNC_ENABLED=true
BUILDING_BANK_SCRAPER_WORKER_URL=http://127.0.0.1:8787
BUILDING_BANK_SCRAPER_WORKER_SECRET=change-me
```

When `WORKER_URL` is set, `/api/building-finance/bank-match/sync-now` calls the worker even on Vercel. OTP from the UI is forwarded to `POST /otp` on the worker.

## Production

Deploy this folder as a long-running Node service (Fly, Railway, VPS, etc.) with Chromium deps. Do **not** run it as a Vercel Serverless Function.

Keep the worker secret identical on BINO and the worker. Prefer private networking / TLS.
