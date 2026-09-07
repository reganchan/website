import { useEffect, useMemo, useRef, useState } from "react";
import { Globe } from "../components/Globe";
import { Timeline } from "../components/Timeline";
import trips from "../data/travel.json";

export type Trip = {
  id: string;
  date: string;
  location: string;
  lat: number;
  lng: number;
};

const TOUR_INTERVAL_MS = 2600;

export function Whereabouts() {
  const sortedTrips = useMemo(
    () => [...(trips as Trip[])].sort((a, b) => a.date.localeCompare(b.date)),
    [],
  );

  const [selectedTripId, setSelectedTripId] = useState<string | null>(
    sortedTrips[0]?.id ?? null,
  );
  const [autoTour, setAutoTour] = useState<boolean>(sortedTrips.length > 1);

  const tourIndex = useRef(0);
  const tourTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!autoTour) {
      if (tourTimer.current !== null) {
        window.clearTimeout(tourTimer.current);
        tourTimer.current = null;
      }
      return;
    }

    const tick = () => {
      if (sortedTrips.length === 0) return;
      tourIndex.current = (tourIndex.current + 1) % sortedTrips.length;
      setSelectedTripId(sortedTrips[tourIndex.current].id);
      tourTimer.current = window.setTimeout(tick, TOUR_INTERVAL_MS);
    };

    tourTimer.current = window.setTimeout(tick, TOUR_INTERVAL_MS);
    return () => {
      if (tourTimer.current !== null) {
        window.clearTimeout(tourTimer.current);
        tourTimer.current = null;
      }
    };
  }, [autoTour, sortedTrips]);

  const handleSelect = (id: string) => {
    setAutoTour(false);
    setSelectedTripId(id);
    const idx = sortedTrips.findIndex((t) => t.id === id);
    if (idx >= 0) tourIndex.current = idx;
  };

  const selectedTrip = sortedTrips.find((t) => t.id === selectedTripId) ?? null;

  return (
    <section id="whereabouts" className="section whereabouts-section">
      <div className="section-heading">
        <p className="eyebrow">whereabouts</p>
        <h2>Places I've been.</h2>
      </div>

      <div className="whereabouts-layout">
        <div className="globe-column">
          <div className="globe-wrapper">
            <Globe
              trips={sortedTrips}
              selectedTripId={selectedTripId}
              onSelectTrip={handleSelect}
            />
          </div>

          <div className="globe-footer">
            <div className="location-label">
              {selectedTrip ? (
                <>
                  <span className="location-label__place">
                    {selectedTrip.location}
                  </span>
                  <small className="location-label__date">
                    {selectedTrip.date}
                  </small>
                </>
              ) : (
                <span className="location-label__place muted">No trip selected</span>
              )}
            </div>

            <button
              type="button"
              className="tour-toggle"
              onClick={() => setAutoTour((v) => !v)}
              disabled={sortedTrips.length < 2}
            >
              {autoTour ? "Pause tour" : "Play tour"}
            </button>
          </div>
        </div>

        <Timeline
          trips={sortedTrips}
          selectedTripId={selectedTripId}
          onSelect={handleSelect}
        />
      </div>
    </section>
  );
}
