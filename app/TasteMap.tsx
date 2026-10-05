"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type Point = { lat: number; lon: number; rank: number };

// A street map with a colored glow over the parts of the city that match your taste best.
export default function TasteMap({ points, color }: { points: Point[]; color: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const mod: any = await import("leaflet");
      const L: typeof import("leaflet") = mod.default ?? mod;
      if (cancelled || !el.current || points.length === 0) return;
      map = L.map(el.current, { scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      const glow = L.featureGroup();
      for (const p of points) {
        L.circle([p.lat, p.lon], { radius: 450, stroke: false, fillColor: color, fillOpacity: 0.08 + 0.6 * p.rank * p.rank }).addTo(glow);
      }
      glow.addTo(map);
      map.fitBounds(glow.getBounds().pad(0.1));
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, color]);

  return <div ref={el} className="h-96 w-full overflow-hidden rounded-2xl border border-[#C9D3DC]" />;
}