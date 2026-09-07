import { useEffect, useMemo, useRef, useState } from "react";
import * as topojson from "topojson-client";
import worldData from "world-atlas/countries-110m.json";
import type { Trip } from "../sections/Whereabouts";
import type { Topology, GeometryCollection } from "topojson-specification";
import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";

type Props = {
  trips: Trip[];
  selectedTripId: string | null;
  onSelectTrip: (tripId: string) => void;
};

type CountryFeature = Feature<Polygon | MultiPolygon, { name: string }>;

type Ring = [number, number][];
type PolygonRings = Ring[];

const COUNTRY_FILL = "#0e0e0e";
const COUNTRY_STROKE = "#2a2a2a";
const GLOBE_BG = "#000000";
const GLOBE_RIM = "#1a1a1a";
const MARKER_COLOR = "#9a9a9a";
const MARKER_COLOR_ACTIVE = "#ffffff";
const ARCS_COLOR = "rgba(255, 255, 255, 0.16)";

const DEG = Math.PI / 180;

type Camera = { lng: number; lat: number };

type View = {
  size: number;
  cx: number;
  cy: number;
  radius: number;
  width: number;
  height: number;
};

type ScreenPoint = { x: number; y: number; z: number };

function projectOrthographic(
  lng: number,
  lat: number,
  view: View,
  camera: Camera,
): ScreenPoint {
  const lambda = (lng - camera.lng) * DEG;
  const phi1 = camera.lat * DEG;
  const phi = lat * DEG;

  const cosC = Math.sin(phi1) * Math.sin(phi) + Math.cos(phi1) * Math.cos(phi) * Math.cos(lambda);
  const clamped = Math.max(-1, Math.min(1, cosC));
  const z = clamped;

  const x = Math.cos(phi) * Math.sin(lambda);
  const y =
    Math.cos(phi1) * Math.sin(phi) -
    Math.sin(phi1) * Math.cos(phi) * Math.cos(lambda);

  return {
    x: view.cx + x * view.radius,
    y: view.cy - y * view.radius,
    z,
  };
}

function projectRing(
  ring: Position[],
  view: View,
  camera: Camera,
): Ring {
  return ring.map((pos) => {
    const p = projectOrthographic(pos[0], pos[1], view, camera);
    return [p.x, p.y];
  });
}

function projectPolygon(
  polygon: Position[][],
  view: View,
  camera: Camera,
): PolygonRings {
  return polygon.map((ring) => projectRing(ring, view, camera));
}

function projectFeature(
  feature: CountryFeature,
  view: View,
  camera: Camera,
): PolygonRings[] {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return [projectPolygon(geom.coordinates, view, camera)];
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.map((poly) => projectPolygon(poly, view, camera));
  }
  return [];
}

function isFeatureVisible(
  feature: CountryFeature,
  view: View,
  camera: Camera,
): boolean {
  const geom = feature.geometry;
  if (geom.type === "Polygon") {
    return testVisibility(geom.coordinates, view, camera);
  }
  if (geom.type === "MultiPolygon") {
    for (const poly of geom.coordinates) {
      if (testVisibility(poly, view, camera)) return true;
    }
    return false;
  }
  return false;
}

function testVisibility(
  polygon: Position[][],
  view: View,
  camera: Camera,
): boolean {
  for (const ring of polygon) {
    for (const pos of ring) {
      if (projectOrthographic(pos[0], pos[1], view, camera).z > 0) return true;
    }
  }
  return false;
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  polygons: PolygonRings[],
) {
  for (const polygon of polygons) {
    for (const ring of polygon) {
      if (ring.length === 0) continue;
      ctx.beginPath();
      ctx.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) {
        ctx.lineTo(ring[i][0], ring[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = ((to - from + 180) % 360 + 360) % 360 - 180;
  return delta;
}

export function Globe({ trips, selectedTripId, onSelectTrip }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const countries = useMemo<CountryFeature[]>(() => {
    const topology = worldData as unknown as Topology;
    const collection = topology.objects.countries as GeometryCollection;
    const featureCollection = topojson.feature(
      topology,
      collection,
    ) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
    return featureCollection.features;
  }, []);

  const cameraRef = useRef<Camera>({ lng: 0, lat: 15 });
  const targetCameraRef = useRef<Camera>({ lng: 0, lat: 15 });
  const animFrameRef = useRef<number | null>(null);
  const pulseRef = useRef(0);

  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setSize({ w: Math.floor(width), h: Math.floor(height) });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedTripId) return;
    const trip = trips.find((t) => t.id === selectedTripId);
    if (!trip) return;
    targetCameraRef.current = {
      lng: -trip.lng,
      lat: Math.max(-60, Math.min(60, trip.lat * 0.6)),
    };
  }, [selectedTripId, trips]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0 || size.h === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(size.w * dpr);
    canvas.height = Math.floor(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const view: View = {
      size: Math.min(size.w, size.h),
      cx: size.w / 2,
      cy: size.h / 2,
      radius: Math.min(size.w, size.h) / 2 - 4,
      width: size.w,
      height: size.h,
    };

    let lastT = performance.now();
    const tick = (now: number) => {
      const dt = Math.min((now - lastT) / 1000, 0.1);
      lastT = now;
      pulseRef.current = (pulseRef.current + dt) % 1000;

      const dLng = shortestAngleDelta(
        cameraRef.current.lng,
        targetCameraRef.current.lng,
      );
      const dLat = targetCameraRef.current.lat - cameraRef.current.lat;
      const k = 1 - Math.pow(0.001, dt);
      cameraRef.current.lng += dLng * k;
      cameraRef.current.lat += dLat * k;

      render(ctx, view, cameraRef.current, countries, trips, selectedTripId, pulseRef.current);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    render(ctx, view, cameraRef.current, countries, trips, selectedTripId, pulseRef.current);
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [size, countries, trips, selectedTripId]);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || size.w === 0) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const view: View = {
      size: Math.min(size.w, size.h),
      cx: size.w / 2,
      cy: size.h / 2,
      radius: Math.min(size.w, size.h) / 2 - 4,
      width: size.w,
      height: size.h,
    };

    const dx = clickX - view.cx;
    const dy = clickY - view.cy;
    if (Math.sqrt(dx * dx + dy * dy) > view.radius) return;

    let bestId: string | null = null;
    let bestDist = 18;
    for (const trip of trips) {
      const p = projectOrthographic(trip.lng, trip.lat, view, cameraRef.current);
      if (p.z < 0) continue;
      const d = Math.hypot(p.x - clickX, p.y - clickY);
      if (d < bestDist) {
        bestDist = d;
        bestId = trip.id;
      }
    }
    if (bestId) onSelectTrip(bestId);
  };

  return (
    <div className="globe" ref={wrapperRef}>
      <canvas
        ref={canvasRef}
        className="globe-canvas"
        onClick={handleClick}
        role="img"
        aria-label="World map showing visited places"
      />
      <div className="globe-hint">click a dot to focus</div>
    </div>
  );
}

function render(
  ctx: CanvasRenderingContext2D,
  view: View,
  camera: Camera,
  countries: CountryFeature[],
  trips: Trip[],
  selectedTripId: string | null,
  pulse: number,
) {
  const { cx, cy, radius, width, height } = view;

  ctx.save();
  ctx.fillStyle = GLOBE_BG;
  ctx.fillRect(0, 0, width, height);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.save();
  ctx.clip();

  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = COUNTRY_FILL;
  ctx.strokeStyle = COUNTRY_STROKE;
  ctx.lineWidth = 0.6;
  ctx.lineJoin = "round";

  for (const feature of countries) {
    if (!isFeatureVisible(feature, view, camera)) continue;
    const polygons = projectFeature(feature, view, camera);
    drawPath(ctx, polygons);
  }

  const sortedTrips = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const pastTrips = sortedTrips.filter((t) => t.id !== selectedTripId);
  const activeTrip = sortedTrips.find((t) => t.id === selectedTripId) ?? null;

  ctx.strokeStyle = ARCS_COLOR;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const trip of pastTrips) {
    const p = projectOrthographic(trip.lng, trip.lat, view, camera);
    if (p.z < 0) continue;
    ctx.moveTo(cx, cy);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  if (activeTrip) {
    const p = projectOrthographic(activeTrip.lng, activeTrip.lat, view, camera);
    if (p.z >= 0) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
  }

  for (const trip of pastTrips) {
    const p = projectOrthographic(trip.lng, trip.lat, view, camera);
    if (p.z < 0) continue;
    ctx.fillStyle = MARKER_COLOR;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
    ctx.fill();
  }

  if (activeTrip) {
    const p = projectOrthographic(activeTrip.lng, activeTrip.lat, view, camera);
    if (p.z >= 0) {
      const pulseScale = 1 + Math.sin(pulse * 4) * 0.4;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 9 * pulseScale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5 * pulseScale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = MARKER_COLOR_ACTIVE;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  ctx.strokeStyle = GLOBE_RIM;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
}
