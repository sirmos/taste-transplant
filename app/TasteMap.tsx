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
      // Set the view first. A map has to know where it is looking before layers are added to it.
      map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lon] as [number, number])).pad(0.1), { maxZoom: 14 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      for (const p of points) {
        L.circle([p.lat, p.lon], { radius: 450, stroke: false, fillColor: color, fillOpacity: 0.08 + 0.6 * p.rank * p.rank }).addTo(map);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, color]);

  return <div ref={el} className="h-96 w-full overflow-hidden rounded-2xl border border-[#C9D3DC]" />;
}