/**
 * Convert a Google Takeout Timeline.json export into the compact
 * travel.json format used by the website.
 *
 * The Google export is an array of timeline objects (visits and activities).
 * We only keep visits to "interesting" places — i.e. not Home, Work, or
 * Searched Address — and we drop places within `HOME_RADIUS_KM` of the
 * user's most-frequented Home location so the timeline focuses on travel.
 *
 * Each output trip represents a unique place (deduplicated by Google
 * placeID) and uses the date of the first visit to that place.
 *
 * If geocoding is enabled (default), each unique coordinate is reverse
 * geocoded via OpenStreetMap Nominatim to produce a human-readable
 * location label. Results are cached on disk so re-runs are fast.
 *
 * Usage:
 *   npm run import:timeline
 *   npm run import:timeline -- --no-geocode
 *
 * The output is written to src/data/travel.json (where the app reads it).
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type RawVisit = {
  startTime?: string;
  endTime?: string;
  visit?: {
    hierarchyLevel?: string;
    probability?: string;
    topCandidate?: {
      placeID?: string;
      semanticType?: string;
      placeLocation?: string;
      probability?: string;
    };
  };
};

type OutputTrip = {
  id: string;
  date: string;
  location: string;
  lat: number;
  lng: number;
};

type GeocodeResponse = {
  address?: {
    city?: string;
    town?: string;
    village?: string;
    hamlet?: string;
    suburb?: string;
    municipality?: string;
    county?: string;
    state?: string;
    region?: string;
    country?: string;
  };
  display_name?: string;
  name?: string;
};

type GeocodeCache = Record<string, string | null>;

const SKIP_SEMANTIC_TYPES = new Set([
  "Home",
  "Inferred Home",
  "Work",
  "Inferred Work",
  "Searched Address",
]);

const HOME_RADIUS_KM = 50;
const MIN_VISIT_MINUTES = 10;
const COORD_DECIMALS = 2;
const CACHE_PRECISION = 3;

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
const REQUEST_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = "personal-site-import/1.0 (geocoder for personal travel timeline)";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseGeo(value: string | undefined): { lat: number; lng: number } | null {
  if (!value) return null;
  const m = value.match(/^geo:(-?\d+\.?\d*),(-?\d+\.?\d*)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function minutesBetween(startIso: string, endIso: string): number {
  const start = Date.parse(startIso);
  const end = Date.parse(endIso);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return (end - start) / 60000;
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatCoordLabel(lat: number, lng: number): string {
  return `${lat.toFixed(COORD_DECIMALS)}°, ${lng.toFixed(COORD_DECIMALS)}°`;
}

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function pickName(data: GeocodeResponse): string | null {
  const addr = data.address;
  if (addr) {
    const candidate =
      addr.city ??
      addr.town ??
      addr.village ??
      addr.hamlet ??
      addr.suburb ??
      addr.municipality ??
      addr.county ??
      addr.state ??
      addr.region ??
      addr.country;
    if (candidate) return candidate;
  }
  if (data.name) return data.name;
  return null;
}

function cleanName(name: string): string {
  return name
    .replace(/\s*,\s*$/, "")
    .replace(/\s+\d{4,5}$/, "")
    .trim();
}

async function loadCache(cachePath: string): Promise<GeocodeCache> {
  try {
    const raw = await readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as GeocodeCache;
    return {};
  } catch {
    return {};
  }
}

async function saveCache(cachePath: string, cache: GeocodeCache): Promise<void> {
  await writeFile(cachePath, JSON.stringify(cache, null, 2) + "\n");
}

async function geocodeWithRetry(
  lat: number,
  lng: number,
  cache: GeocodeCache,
): Promise<string | null> {
  const key = cacheKey(lat, lng);
  if (key in cache) return cache[key];

  const url = `${NOMINATIM_URL}?format=jsonv2&lat=${lat.toFixed(6)}&lon=${lng.toFixed(6)}&zoom=10&accept-language=en`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`  ! Nominatim ${res.status} for ${key}`);
      return null;
    }
    const data = (await res.json()) as GeocodeResponse;
    const name = pickName(data);
    const cleaned = name ? cleanName(name) : null;
    cache[key] = cleaned;
    return cleaned;
  } catch (err) {
    console.warn(`  ! Nominatim error for ${key}: ${(err as Error).message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function geocodeAll(
  coords: Array<{ lat: number; lng: number }>,
  cache: GeocodeCache,
  cachePath: string,
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  let queried = 0;
  let cached = 0;
  let failed = 0;
  let lastRequestAt = 0;

  for (let i = 0; i < coords.length; i++) {
    const { lat, lng } = coords[i];
    const key = cacheKey(lat, lng);

    if (key in cache) {
      cached++;
      out.set(key, cache[key]);
      continue;
    }

    const elapsed = Date.now() - lastRequestAt;
    if (elapsed < REQUEST_INTERVAL_MS) {
      await sleep(REQUEST_INTERVAL_MS - elapsed);
    }

    const result = await geocodeWithRetry(lat, lng, cache);
    lastRequestAt = Date.now();
    if (result === null) failed++;
    else queried++;
    out.set(key, result);

    if ((queried + failed) % 25 === 0) {
      await saveCache(cachePath, cache);
    }

    if ((i + 1) % 10 === 0 || i === coords.length - 1) {
      console.log(
        `  geocoding ${i + 1}/${coords.length} (queried ${queried}, cached ${cached}, failed ${failed})`,
      );
    }
  }

  await saveCache(cachePath, cache);
  return out;
}

function parseArgs(argv: string[]): { geocode: boolean } {
  return {
    geocode: !argv.includes("--no-geocode"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const inputPath = path.resolve(__dirname, "Timeline.json");
  const outputPath = path.resolve(__dirname, "..", "src", "data", "travel.json");
  const cachePath = path.resolve(__dirname, ".geocode-cache.json");

  console.log(`Reading ${inputPath}…`);
  const raw = JSON.parse(await readFile(inputPath, "utf8")) as RawVisit[];

  if (!Array.isArray(raw)) {
    throw new Error("Expected the input JSON to contain an array.");
  }

  const homePlaceCounts = new Map<string, { count: number; geo: { lat: number; lng: number } | null }>();
  const placeMap = new Map<
    string,
    {
      placeID: string;
      firstDate: string;
      firstLat: number;
      firstLng: number;
      latSum: number;
      lngSum: number;
      count: number;
    }
  >();

  let totalVisits = 0;
  let keptVisits = 0;

  for (const item of raw) {
    if (!item.visit) continue;
    const cand = item.visit.topCandidate;
    if (!cand?.placeID || !cand.placeLocation) continue;

    const placeID = cand.placeID;
    const sem = cand.semanticType ?? "Unknown";
    const geo = parseGeo(cand.placeLocation);
    if (!geo) continue;

    const startTime = item.startTime;
    const endTime = item.endTime;
    if (!startTime || !endTime) continue;
    const durationMin = minutesBetween(startTime, endTime);
    if (durationMin < MIN_VISIT_MINUTES) continue;

    totalVisits++;

    if (sem === "Home") {
      const cur = homePlaceCounts.get(placeID);
      if (cur) {
        cur.count++;
      } else {
        homePlaceCounts.set(placeID, { count: 1, geo });
      }
      continue;
    }

    if (SKIP_SEMANTIC_TYPES.has(sem)) continue;

    const date = isoDateOnly(startTime);
    const existing = placeMap.get(placeID);
    if (existing) {
      existing.count++;
      existing.latSum += geo.lat;
      existing.lngSum += geo.lng;
      if (date < existing.firstDate) {
        existing.firstDate = date;
        existing.firstLat = geo.lat;
        existing.firstLng = geo.lng;
      }
    } else {
      placeMap.set(placeID, {
        placeID,
        firstDate: date,
        firstLat: geo.lat,
        firstLng: geo.lng,
        latSum: geo.lat,
        lngSum: geo.lng,
        count: 1,
      });
    }
    keptVisits++;
  }

  let homeCenter: { lat: number; lng: number } | null = null;
  if (homePlaceCounts.size > 0) {
    let best: { id: string; count: number; geo: { lat: number; lng: number } | null } | null = null;
    for (const [id, info] of homePlaceCounts) {
      if (!info.geo) continue;
      if (!best || info.count > best.count) best = { id, count: info.count, geo: info.geo };
    }
    if (best?.geo) homeCenter = best.geo;
  }

  const candidates: Array<{
    placeID: string;
    firstDate: string;
    avgLat: number;
    avgLng: number;
  }> = [];
  let droppedLocal = 0;

  for (const p of placeMap.values()) {
    if (homeCenter) {
      const d = haversineKm(homeCenter, { lat: p.firstLat, lng: p.firstLng });
      if (d < HOME_RADIUS_KM) {
        droppedLocal++;
        continue;
      }
    }
    const avgLat = p.latSum / p.count;
    const avgLng = p.lngSum / p.count;
    candidates.push({
      placeID: p.placeID,
      firstDate: p.firstDate,
      avgLat,
      avgLng,
    });
  }

  let labels: Map<string, string | null> = new Map();
  if (args.geocode) {
    const uniqueCoords = new Map<string, { lat: number; lng: number }>();
    for (const c of candidates) {
      const k = cacheKey(c.avgLat, c.avgLng);
      if (!uniqueCoords.has(k)) uniqueCoords.set(k, { lat: c.avgLat, lng: c.avgLng });
    }
    const cache = await loadCache(cachePath);
    console.log(`Reverse geocoding ${uniqueCoords.size} unique coordinates…`);
    labels = await geocodeAll(
      Array.from(uniqueCoords.values()),
      cache,
      cachePath,
    );
  }

  const trips: OutputTrip[] = candidates.map((c) => {
    const k = cacheKey(c.avgLat, c.avgLng);
    const name = labels.get(k);
    return {
      id: `${c.placeID}-${c.firstDate}`,
      date: c.firstDate,
      location: name ?? formatCoordLabel(c.avgLat, c.avgLng),
      lat: Number(c.avgLat.toFixed(4)),
      lng: Number(c.avgLng.toFixed(4)),
    };
  });

  trips.sort((a, b) => a.date.localeCompare(b.date));

  await writeFile(outputPath, JSON.stringify(trips, null, 2) + "\n");

  console.log(`Total visits scanned:  ${totalVisits}`);
  console.log(`Visits after filtering: ${keptVisits}`);
  console.log(`Unique places:         ${placeMap.size}`);
  console.log(`Dropped (local):       ${droppedLocal}`);
  console.log(`Home center:           ${homeCenter ? formatCoordLabel(homeCenter.lat, homeCenter.lng) : "(none found)"}`);
  console.log(`Geocoding:             ${args.geocode ? "enabled" : "disabled"}`);
  console.log(`Cache:                 ${cachePath}`);
  console.log(`Wrote ${trips.length} trips to ${outputPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
