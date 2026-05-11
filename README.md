# Foopy Starter

A starter Next.js website for an AFL RealSports-style project.

## Run locally

```bash
npm install
npm run dev
```

Open https://foopy.app

## Deploy

Push to GitHub, import the repo into Vercel, and add your Supabase env vars later.

## Scraping

Run:

```bash
npm run scrape:footywire
```

The scraper currently creates safe starter/demo JSON. Build this into real FootyWire scraping page-by-page.

## Important

Do not make every website visitor scrape FootyWire. Scrape from the server, cache/save results, then show users your cached data.
