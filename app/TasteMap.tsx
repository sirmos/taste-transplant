"use client";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type Point = { lat: number; lon: number; rank: number };
export type Pin = { lat: number; lon: number; name: string; where: string; color: string; exact: boolean };

// A street map with one dot for each match, over a soft glow where the city fits your taste best.
export default function TasteMap({ points, pins, color }: { points: Point[]; pins: Pin[]; color: string }) {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const mod: any = await import("leaflet");
      const L: typeof import("leaflet") = mod.default ?? mod;
      const focus: { lat: number; lon: number }[] = pins.length > 0 ? pins : points;
      if (cancelled || !el.current || focus.length === 0) return;
      map = L.map(el.current, { scrollWheelZoom: false });
      // Set the view first. A map has to know where it is looking before layers are added to it.
      map.fitBounds(L.latLngBounds(focus.map((p) => [p.lat, p.lon] as [number, number])).pad(0.2), { maxZoom: 15 });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
      for (const p of points) {
        L.circle([p.lat, p.lon], { radius: 450, stroke: false, fillColor: color, fillOpacity: 0.04 + 0.45 * p.rank }).addTo(map);
      }
      for (const p of pins) {
        const dot = L.circleMarker([p.lat, p.lon], { radius: p.exact ? 11 : 8, color: "#ffffff", weight: 2, fillColor: p.color, fillOpacity: 1 }).addTo(map);
        const tip = document.createElement("div");
        const b = document.createElement("strong");
        b.textContent = p.name;
        tip.appendChild(b);
        if (p.where) {
          tip.appendChild(document.createElement("br"));
          tip.appendChild(document.createTextNode(p.where));
        }
        dot.bindTooltip(tip.cloneNode(true) as HTMLElement);
        dot.bindPopup(tip);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, [points, pins, color]);

  return (
    <>
      {/* Tailwind shrinks images, which breaks map tiles. This keeps tiles at their own size. */}
      <style>{`.leaflet-container img, .leaflet-container .leaflet-tile { max-width: none !important; max-height: none !important; }`}</style>
      <div ref={el} className="h-96 w-full overflow-hidden rounded-2xl border border-[#C9D3DC]" />
    </>
  );
}