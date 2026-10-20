"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef } from "react";
import { circleRadius, hotspotLabel, type Hotspot } from "@/ui/hotspots";

const TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const FIT_PADDING: [number, number] = [36, 36];
const MAX_ZOOM = 15;

/**
 * Leaflet map with one circle per hotspot, sized by how strongly the audience concentrates there. Leaflet touches
 * `window`, so this module is only ever loaded in the browser (see HotspotMapLoader).
 */
export default function HotspotMap({ spots, city }: { spots: readonly Hotspot[]; city: string }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = host.current;
    if (!node || spots.length === 0) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void import("leaflet").then((L) => {
      if (disposed) return;
      const map = L.map(node, { scrollWheelZoom: false, zoomControl: true });
      L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 }).addTo(map);
      const layers = spots.map((s) =>
        L.circleMarker([s.lat, s.lon], {
          radius: circleRadius(s.affinity),
          color: "#2433d9",
          weight: s.listed ? 3 : 1.5,
          fillColor: "#2433d9",
          fillOpacity: 0.18 + 0.4 * s.affinity,
        })
          .bindTooltip(hotspotLabel(s), { direction: "top" })
          .addTo(map),
      );
      map.fitBounds(L.featureGroup(layers).getBounds(), { padding: FIT_PADDING, maxZoom: MAX_ZOOM });
      cleanup = () => map.remove();
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [spots]);

  return (
    <div
      ref={host}
      className="hotmap"
      role="img"
      aria-label={`Map of ${city} showing where this audience concentrates: ${spots.map(hotspotLabel).join("; ")}`}
    />
  );
}
