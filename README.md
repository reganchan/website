# Personal Website

Minimal static personal website with:

- black background / white navigation
- About section
- interactive Three.js globe
- travel timeline
- Generator placeholder
- Contact section
- no backend required

## Requirements

- Node.js 20+

## Run locally

```bash
npm install
npm run dev
```

Then open the local Vite URL.

## Build

```bash
npm run build
```

The production output is in `dist/`.

## Profile photo

Put your image at:

```text
public/images/profile.jpg
```

The About section will automatically use it.

## Travel data

The frontend reads:

```text
src/data/travel.json
```

The intended data format is:

```json
[
  {
    "id": "tokyo-2026",
    "date": "2026-05-18",
    "location": "Tokyo, Japan",
    "lat": 35.6762,
    "lng": 139.6503
  }
]
```

The included importer is deliberately kept separate from the frontend:

```bash
npm run import:timeline -- ./timeline.json
```

Google Timeline exports have changed formats over time, so inspect your current
export and adapt `scripts/import-google-timeline.ts` to normalize it into the
format above.

## Deployment

This is a static Vite site. It can be deployed to GitHub Pages, Cloudflare
Pages, Netlify, Vercel, or any static web server.

The Vite config uses a relative base (`./`) so the built site works under a
repository subpath as well.

## Notes

The globe currently uses a deliberately minimal monochrome treatment rather
than a detailed geographic texture. A later iteration can add a GeoJSON
country outline layer, animated travel arcs, clustering, and a more accurate
camera-to-location rotation.
