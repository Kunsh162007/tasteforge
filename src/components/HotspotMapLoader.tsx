"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { Brief } from "@/ui/contract";
import { hotspotsFromBrief } from "@/ui/hotspots";
import { useEvidenceRecords } from "./EvidenceContext";

// Client-only: Leaflet needs the DOM, so it is never part of the server render.
const HotspotMap = dynamic(() => import("./HotspotMap"), {
  ssr: false,
  loading: () => <div className="hotmap hotmap--loading" aria-hidden="true" />,
});

/** The map for the "where they are" section; renders nothing when the evidence has no coordinates. */
export function HotspotMapLoader({ brief }: { brief: Brief }) {
  const evidence = useEvidenceRecords();
  const spots = useMemo(() => hotspotsFromBrief(brief, evidence), [brief, evidence]);
  if (spots.length === 0 || !brief.whereTheyAre) return null;
  return (
    <figure className="hotmap-wrap">
      <HotspotMap spots={spots} city={brief.whereTheyAre.city} />
      <figcaption className="hotmap__cap">
        Circles are sized by how strongly this audience concentrates in each area. Map data &copy; OpenStreetMap contributors.
      </figcaption>
    </figure>
  );
}
