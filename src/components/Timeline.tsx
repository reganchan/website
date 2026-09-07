import { useMemo } from "react";
import type { Trip } from "../sections/Whereabouts";

type Props = {
  trips: Trip[];
  selectedTripId: string | null;
  onSelect: (id: string) => void;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

type TimelineEntry =
  | { kind: "year"; year: string }
  | { kind: "month"; year: string; month: number; hasTrips: boolean }
  | { kind: "trip"; trip: Trip };

function buildEntries(trips: Trip[]): TimelineEntry[] {
  const sorted = [...trips].sort((a, b) => a.date.localeCompare(b.date));
  const entries: TimelineEntry[] = [];
  let lastYear: string | null = null;
  let lastMonth: number | null = null;

  for (const trip of sorted) {
    const year = trip.date.slice(0, 4);
    const month = Number(trip.date.slice(5, 7));

    if (year !== lastYear) {
      entries.push({ kind: "year", year });
      lastYear = year;
      lastMonth = null;
    }

    if (month !== lastMonth) {
      entries.push({
        kind: "month",
        year,
        month,
        hasTrips: true,
      });
      lastMonth = month;
    }

    entries.push({ kind: "trip", trip });
  }

  return entries;
}

export function Timeline({ trips, selectedTripId, onSelect }: Props) {
  const entries = useMemo(() => buildEntries(trips), [trips]);
  const selectedTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  if (entries.length === 0) {
    return (
      <aside className="timeline">
        <p className="timeline-empty">No trips yet.</p>
      </aside>
    );
  }

  return (
    <aside className="timeline">
      <div className="timeline-scroll">
        <ol className="timeline-axis">
          {entries.map((entry, index) => {
            if (entry.kind === "year") {
              return (
                <li key={`y-${entry.year}-${index}`} className="tl-item tl-year">
                  <span className="tl-tick tl-tick--year" />
                  <span className="tl-label tl-label--year">{entry.year}</span>
                </li>
              );
            }

            if (entry.kind === "month") {
              return (
                <li
                  key={`m-${entry.year}-${entry.month}-${index}`}
                  className="tl-item tl-month"
                >
                  <span className="tl-tick tl-tick--month" />
                  <span className="tl-label tl-label--month">
                    {MONTH_NAMES[entry.month - 1]}
                  </span>
                </li>
              );
            }

            const { trip } = entry;
            const isSelected = selectedTrip?.id === trip.id;
            return (
              <li
                key={trip.id}
                className={`tl-item tl-trip ${isSelected ? "tl-trip--active" : ""}`}
              >
                <button
                  className="tl-node"
                  onClick={() => onSelect(trip.id)}
                  aria-label={`${trip.location} on ${trip.date}`}
                  title={`${trip.location} · ${trip.date}`}
                >
                  <span className="tl-tick tl-tick--trip" />
                </button>
                <div className="tl-trip-meta">
                  <span className="tl-trip-date">
                    {trip.date.slice(5).replace("-", " · ")}
                  </span>
                  <span className="tl-trip-location">{trip.location}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
