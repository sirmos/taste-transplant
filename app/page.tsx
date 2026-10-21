"use client";
import { useEffect, useMemo, useState } from "react";
import TasteMap, { type Pin, type Point } from "./TasteMap";
import { Coffee, Wine, Music, BookOpen, Shirt, MapPin, Copy, Check, Printer, Share2, Trophy, ShoppingBag, Utensils, Bed, TreePine, Landmark, Scissors, Sparkles } from "lucide-react";

type Item = { id: string; name: string; image: string; where: string; description: string; tags: string[]; shared?: string[]; exact?: boolean; lat?: number; lon?: number; serves?: string };
type Lane = { id: string; title: string; seed?: string; kind: string; items: Item[] };
type Culture = { id: string; title: string; items: { id: string; name: string; image: string }[] }[];
type Understood = { typed: string; matched: string | null; suggestions?: string[] };

// Each lane gets its own color. The icon follows the kind of place.
const PALETTE = [
  { color: "#D6336C", soft: "#FBDDE8" }, { color: "#4C5BE8", soft: "#E0E3FD" }, { color: "#0E9384", soft: "#D5F2EE" }, { color: "#D9822B", soft: "#FCEBD6" },
  { color: "#F05A3C", soft: "#FDE0D9" }, { color: "#7B3FE4", soft: "#EADFFC" }, { color: "#2A8BC7", soft: "#D9ECF8" }, { color: "#5E8C1F", soft: "#E3F0CF" },
];
function iconFor(kind: string) {
  const k = kind.toLowerCase();
  if (/barber|salon|spa/.test(k)) return Scissors;
  if (/stadium|arena|sport|gym|fitness/.test(k)) return Trophy;
  if (/book|library/.test(k)) return BookOpen;
  if (/coffee|cafe|bakery/.test(k)) return Coffee;
  if (/clothing|vintage|fashion|boutique/.test(k)) return Shirt;
  if (/mall|shopping|market|store/.test(k)) return ShoppingBag;
  if (/bar|pub|brew|club|lounge|wine|cocktail/.test(k)) return Wine;
  if (/music|concert|venue/.test(k)) return Music;
  if (/restaurant|food|grill|pizza|diner/.test(k)) return Utensils;
  if (/hotel|resort|lodging/.test(k)) return Bed;
  if (/park|beach|garden|nature/.test(k)) return TreePine;
  if (/museum|art|gallery|church|mosque|temple/.test(k)) return Landmark;
  return Sparkles;
}
const MAX_PLACES = 8;

// The first month, in four stages. Each stage shows places from your own matches first, then from what Qloo knows about the city.
const STAGES = [
  { title: "Days 1 to 3", sub: "Sort out the basics", color: "#D6336C" },
  { title: "Week 1", sub: "Build your routine", color: "#4C5BE8" },
  { title: "Weeks 2 and 3", sub: "Find your people", color: "#0E9384" },
  { title: "Week 4", sub: "Make it yours", color: "#D9822B" },
];
// If one of your own matches is this kind of place, it goes in that slot first.
const OWN: Record<string, RegExp> = {
  bank: /bank|atm/i,
  pharmacy: /pharmac|drug/i,
  grocery: /supermarket|grocery|market/i,
  clinic: /hospital|clinic|medical|diagnostic/i,
  salon: /barber|salon|hair|beauty|personal care/i,
  eat: /restaurant|food|grill|pizza|chicken|bakery|diner/i,
  gym: /gym|fitness|sport|stadium/i,
  bar: /\bbar\b|pub|club|lounge|brew|music/i,
  mall: /mall|shopping/i,
  sight: /park|beach|tourist|museum|garden|attraction/i,
};
type KitSlot = { id: string; label: string; stage: number; why: string; items: Item[] };
type Task = { key: string; label: string; item: Item; note: string };
const D = "font-[family-name:var(--font-display)]";
const slot = "field-sizing-content min-w-[7ch] border-b-2 border-[#FFC43D] bg-transparent px-1 text-[#FFC43D] placeholder:text-[#FFC43D]/40 focus:border-white focus:text-white focus:outline-none";

type Style = { color: string; soft: string; Icon: typeof Coffee };
function Card({ it, c, mode, city }: { it: Item; c: Style; mode: "you" | "popular" | "rising" | "dish"; city: string }) {
  async function share() {
    const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${it.name} ${city}`)}`;
    let where = "";
    if (window.confirm("Add your current location to the message? Your phone will ask for permission.")) {
      try {
        const pos = await new Promise<GeolocationPosition>((ok, no) => navigator.geolocation.getCurrentPosition(ok, no, { timeout: 8000 }));
        where = `\nMy location now: https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`;
      } catch {}
    }
    const text = `I am planning to go to ${it.name} in ${city}.\nMap: ${maps}${where}\nPlease check on me later.`;
    if (navigator.share) await navigator.share({ text }).catch(() => {});
    else {
      await navigator.clipboard.writeText(text);
      window.alert("Trip details copied. Paste them to someone you trust.");
    }
  }
  const pill = mode === "popular" ? "Popular pick" : mode === "rising" ? "Rising now" : mode === "dish" ? it.serves || "Serves it" : it.exact ? "Same brand" : "";
  return (
    <li className="overflow-hidden rounded-2xl bg-white shadow-[0_1px_2px_rgba(21,11,46,.06),0_10px_28px_-14px_rgba(21,11,46,.25)] transition hover:-translate-y-1">
      <div className="relative h-32 overflow-hidden" style={{ background: `linear-gradient(135deg, ${c.color}, ${c.color}CC)` }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgba(255,255,255,.3),transparent_55%)]" />
        {!it.image && <c.Icon className="absolute -bottom-4 -right-3 text-white/30" size={120} strokeWidth={1.2} />}
        {it.image && <img src={it.image} alt="" referrerPolicy="no-referrer" className="relative h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
        {pill && (
          <span className="absolute left-3 top-3 max-w-[85%] truncate rounded-full bg-white px-3 py-1 text-xs font-semibold" style={{ color: mode === "you" ? c.color : "#4A4166" }}>{pill}</span>
        )}
      </div>
      <div className="p-4">
        <h4 className={`${D} text-xl leading-tight`}>{it.name}</h4>
        {it.where && <p className="mt-1 text-sm text-[#6B6288]">{it.where}</p>}
        {it.shared && it.shared.length > 0 && (
          <p className="mt-3 text-xs text-[#4A4166]"><span className="font-semibold">In common:</span> {it.shared.join(", ")}</p>
        )}
        {it.tags.length > 0 && (
          <p className="mt-3 flex flex-wrap gap-1.5">
            {it.tags.map((t) => <span key={t} className="rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ background: c.soft, color: c.color }}>{t}</span>)}
          </p>
        )}
        {it.description && <p className="mt-3 line-clamp-2 text-sm text-[#4A4166]">{it.description}</p>}
        <div className="mt-3 flex items-center gap-4">
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${it.name} ${city}`)}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: c.color }}>
            <MapPin size={14} /> Open in Maps
          </a>
          <button onClick={share} className="inline-flex items-center gap-1 text-sm font-semibold text-[#4A4166] hover:text-[#150B2E]">
            <Share2 size={14} /> Share trip
          </button>
        </div>
      </div>
    </li>
  );
}

const DISH_STYLE = { color: "#D9822B", soft: "#FCEBD6", Icon: Utensils };
const inputCls = "min-w-[14rem] flex-1 rounded-full border border-[#B8C4CF] bg-white px-5 py-3 text-[#16202B] placeholder:text-[#8796A5] focus:outline-2 focus:outline-[#7B5CFF]";

export default function Home() {
  const [home, setHome] = useState("");
  const [next, setNext] = useState("");
  const [loves, setLoves] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [popular, setPopular] = useState<Item[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [empty, setEmpty] = useState<string[]>([]);
  const [seeds, setSeeds] = useState<{ id: string; name: string }[]>([]);
  const [mapFor, setMapFor] = useState("all");
  const [mapPoints, setMapPoints] = useState<Point[]>([]);
  const [mapState, setMapState] = useState<"idle" | "loading" | "none">("idle");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [culture, setCulture] = useState<Culture>([]);
  const [cultureState, setCultureState] = useState<"idle" | "loading" | "none">("idle");
  const [rising, setRising] = useState<Item[]>([]);
  const [risingState, setRisingState] = useState<"idle" | "loading" | "none">("idle");
  async function loadRising() {
    if (rising.length > 0 || risingState === "loading") return;
    setRisingState("loading");
    try {
      const res = await fetch("/api/rising", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: shownCity, ids: seeds.map((x) => x.id) }) });
      const data = await res.json().catch(() => ({}));
      setRising(data.items ?? []);
      setRisingState(data.items?.length ? "idle" : "none");
    } catch {
      setRisingState("none");
    }
  }
  useEffect(() => {
    try {
      setDone(JSON.parse(localStorage.getItem("tt-done") ?? "{}"));
    } catch {}
  }, []);
  const [kit, setKit] = useState<KitSlot[]>([]);
  const [kitState, setKitState] = useState<"idle" | "loading" | "none">("idle");
  // Your own matches go first in each slot, then places Qloo suggests for that kind of place.
  const stages = useMemo(() => {
    const out = STAGES.map((st) => ({ ...st, tasks: [] as Task[] }));
    for (const slot of kit) {
      const picks: { item: Item; note: string }[] = [];
      const re = OWN[slot.id];
      if (re) {
        for (const lane of lanes) {
          if (picks.length >= 1) break;
          const first = lane.items[0];
          if (first && re.test(`${lane.kind} ${lane.seed ?? ""}`)) picks.push({ item: first, note: first.exact ? `Same brand as ${lane.seed}` : `Like ${lane.seed}` });
        }
      }
      for (const it of slot.items) {
        if (picks.length >= 2) break;
        if (!picks.some((x) => x.item.id === it.id || x.item.name === it.name)) picks.push({ item: it, note: slot.why });
      }
      picks.forEach((x) => out[slot.stage].tasks.push({ key: `${slot.id}:${x.item.id}`, label: slot.label, item: x.item, note: x.note }));
    }
    return out;
  }, [kit, lanes]);
  const planCount = stages.reduce((n, st) => n + st.tasks.length, 0);
  const doneCount = stages.reduce((n, st) => n + st.tasks.filter((t) => done[t.key]).length, 0);
  async function loadKit() {
    setKitState("loading");
    try {
      const res = await fetch("/api/kit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: shownCity, ids: seeds.map((x) => x.id) }) });
      const data = await res.json().catch(() => ({}));
      setKit(data.slots ?? []);
      setKitState(data.slots?.length ? "idle" : "none");
    } catch {
      setKitState("none");
    }
  }
  // What the person typed in the search, kept so we can run the same places through a second city.
  const [last, setLast] = useState<{ home: string; loves: string[] } | null>(null);
  const [cityPoint, setCityPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [dishText, setDishText] = useState("");
  const [homeCountry, setHomeCountry] = useState("");
  const [dishGroups, setDishGroups] = useState<{ dish: string; items: Item[]; note?: string }[]>([]);
  const [dishState, setDishState] = useState<"idle" | "loading" | "none">("idle");
  const [cmpCity, setCmpCity] = useState("");
  const [cmp, setCmp] = useState<{ city: string; lanes: Lane[]; cityImage: string } | null>(null);
  const [cmpState, setCmpState] = useState<"idle" | "loading" | "error">("idle");
  const [cmpError, setCmpError] = useState("");

  async function findDishes() {
    const dishes = dishText.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 3);
    if (dishes.length === 0) return;
    setDishState("loading");
    setDishGroups([]);
    try {
      const res = await fetch("/api/dishes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city: shownCity, dishes, ids: seeds.map((x) => x.id), lat: cityPoint?.lat, lon: cityPoint?.lon, homeCountry }),
      });
      const data = await res.json().catch(() => ({}));
      setDishGroups(data.groups ?? []);
      setDishState(data.groups?.length ? "idle" : "none");
    } catch {
      setDishState("none");
    }
  }

  // Run the same places through a second city, then compare the two.
  async function compare() {
    if (!cmpCity.trim() || !last) return;
    setCmpState("loading");
    setCmp(null);
    try {
      const res = await fetch("/api/transplant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ homeCity: last.home, newCity: cmpCity, loves: last.loves }) });
      const data = await res.json().catch(() => ({ error: "The server took too long or failed. Try again in a minute." }));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      setCmp({ city: cmpCity.trim(), lanes: data.lanes, cityImage: data.cityImage });
      setCmpState("idle");
    } catch (e) {
      setCmpError((e as Error).message);
      setCmpState("error");
    }
  }
  const statsOf = (ls: Lane[]) => ({ matched: ls.length, exact: ls.flatMap((l) => l.items).filter((i) => i.exact).length, similar: ls.flatMap((l) => l.items).filter((i) => !i.exact).length });
  const cmpRows = cmp
    ? [
        { label: `Your places with a match (of ${seeds.length})`, a: statsOf(lanes).matched, b: statsOf(cmp.lanes).matched },
        { label: "Same-brand places", a: statsOf(lanes).exact, b: statsOf(cmp.lanes).exact },
        { label: "Similar places found", a: statsOf(lanes).similar, b: statsOf(cmp.lanes).similar },
      ]
    : [];
  const cmpWinner = cmpRows.map((r) => (r.a === r.b ? -1 : r.a > r.b ? 0 : 1));
  const winsA = cmpWinner.filter((w) => w === 0).length;
  const winsB = cmpWinner.filter((w) => w === 1).length;

  function toggle(k: string) {
    const next = { ...done, [k]: !done[k] };
    setDone(next);
    try {
      localStorage.setItem("tt-done", JSON.stringify(next));
    } catch {}
  }
  async function loadCulture() {
    setCultureState("loading");
    try {
      const res = await fetch("/api/culture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city: shownCity, ids: seeds.map((x) => x.id) }) });
      const data = await res.json().catch(() => ({}));
      setCulture(data.groups ?? []);
      setCultureState(data.groups?.length ? "idle" : "none");
    } catch {
      setCultureState("none");
    }
  }
  // One dot for each match of the place you picked (or of all places), in that place's color.
  const pins = useMemo<Pin[]>(() => {
    const out: Pin[] = [];
    lanes.forEach((lane, idx) => {
      if (mapFor !== "all" && lane.id !== mapFor) return;
      const color = PALETTE[idx % PALETTE.length].color;
      for (const it of lane.items) {
        if (typeof it.lat === "number" && typeof it.lon === "number") out.push({ lat: it.lat, lon: it.lon, name: it.name, where: it.where, color, exact: !!it.exact });
      }
    });
    return out;
  }, [lanes, mapFor]);
  const [understood, setUnderstood] = useState<Understood[]>([]);
  const [shownCity, setShownCity] = useState("");
  const [cityImage, setCityImage] = useState("");
  const [guessed, setGuessed] = useState(false);
  const [mode, setMode] = useState<"you" | "popular" | "rising">("you");
  const [copied, setCopied] = useState(false);

  const typedCount = loves.split("\n").filter((l) => l.trim()).length;
  const total = lanes.reduce((n, l) => n + l.items.length, 0);
  const compared = popular.length > 0 ? total : 0;
  const popularIds = new Set(popular.map((p) => p.id));
  const missed = lanes.flatMap((l) => l.items).filter((i) => !popularIds.has(i.id)).length;

  function sampleCorps() {
    setHome("Uyo");
    setNext("Lagos");
    setLoves("NYSC Orientation Camp\nFirst Bank\nChicken Republic\nQua Iboe Church");
  }

  function sample() {
    setHome("Toronto");
    setNext("Chicago");
    setLoves("St. Lawrence Market\nKensington Market\nBellwoods Brewery");
  }

  // Make a picture of a few matches and share it, or open it so it can be saved.
  async function shareCard() {
    const qs = new URLSearchParams({ city: shownCity });
    lanes.slice(0, 4).forEach((l) => l.items[0] && qs.append("m", `${l.items[0].name}~${l.seed ?? ""}`));
    const url = `/api/card?${qs.toString()}`;
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], "my-taste.png", { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: `My taste, moved to ${shownCity}` });
        return;
      }
    } catch {}
    window.open(url, "_blank");
  }

  function copy() {
    const text = lanes.map((l) => `${l.title}\n` + l.items.map((i) => `- ${i.name}${i.where ? ` (${i.where})` : ""}`).join("\n")).join("\n\n");
    navigator.clipboard.writeText(`My taste, moved to ${shownCity}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Ask Qloo's heatmap which parts of the new city match your places.
  async function loadMap(which: string, list = seeds, city = shownCity) {
    setMapFor(which);
    setMapState("loading");
    try {
      const ids = which === "all" ? list.map((x) => x.id) : [which];
      const res = await fetch("/api/heatmap", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, ids }) });
      const data = await res.json().catch(() => ({}));
      setMapPoints(data.points ?? []);
      setMapState(data.points?.length ? "idle" : "none");
    } catch {
      setMapPoints([]);
      setMapState("none");
    }
  }

  async function go() {
    setBusy(true);
    setError("");
    setLanes([]);
    setMode("you");
    setRising([]);
    setRisingState("idle");
    setCulture([]);
    setCultureState("idle");
    setKit([]);
    setKitState("idle");
    setDishGroups([]);
    setDishState("idle");
    setCmp(null);
    setCmpState("idle");
    try {
      const res = await fetch("/api/transplant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeCity: home, newCity: next, loves: loves.split("\n") }),
      });
      const data = await res.json().catch(() => ({ error: "The server took too long or failed. Try fewer places, or try again in a minute." }));
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      setLanes(data.lanes);
      setPopular(data.popular ?? []);
      setSkipped(data.skipped ?? []);
      setEmpty(data.empty ?? []);
      setSeeds(data.seeds ?? []);
      setCityPoint(data.cityPoint ?? null);
      setHomeCountry(data.homeCountry ?? "");
      setLast({ home, loves: loves.split("\n") });
      loadMap("all", data.seeds ?? [], next);
      setUnderstood(data.understood);
      setCityImage(data.cityImage);
      setGuessed(data.guessed);
      setShownCity(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F7F4FF] font-[family-name:var(--font-body)] text-[#150B2E]">
      <style>{`@media print { body * { visibility: hidden; } .print-area, .print-area * { visibility: visible; } .print-area { position: absolute; left: 0; top: 0; width: 100%; } .no-print { display: none !important; } }`}</style>
      <header className="relative overflow-hidden bg-[#150B2E] text-white">
        <div aria-hidden className="pointer-events-none absolute -left-24 top-24 h-96 w-96 rounded-full bg-[#7B5CFF]/40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-16 h-80 w-80 rounded-full bg-[#FF5A5F]/30 blur-3xl" />
        <div className="relative mx-auto max-w-5xl px-5 pb-16 pt-6">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <span className="relative h-6 w-9">
                <span className="absolute left-0 h-6 w-6 rounded-full bg-[#FF5A5F]" />
                <span className="absolute left-3 h-6 w-6 rounded-full bg-[#FFC43D] mix-blend-screen" />
              </span>
              Taste Transplant
            </div>
            <span className="rounded-full border border-white/20 px-3 py-1 text-sm text-white/80">Powered by Qloo</span>
          </nav>

          <h1 className={`${D} mt-14 max-w-3xl text-5xl leading-[1.05] sm:text-7xl`}>Take your taste with you.</h1>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Moved somewhere new? Tell us the places you loved back home and we will find their closest matches in your new city.
          </p>
          <p className="mt-3 max-w-xl text-sm text-white/60">For anyone starting over somewhere new: students, people moving for work, and corps members posted to a new state.</p>

          <div className="mt-10 max-w-3xl">
            <p className={`${D} text-3xl leading-snug sm:text-4xl`}>
              I moved from <input className={slot} value={home} onChange={(e) => setHome(e.target.value)} placeholder="Toronto" aria-label="City you moved from" /> to{" "}
              <input className={slot} value={next} onChange={(e) => setNext(e.target.value)} placeholder="Chicago" aria-label="City you moved to" />.
            </p>
            <p className="mt-2 text-sm text-white/60">Posted to a state? Type the state, or the nearest big town.</p>
            <label className="mt-6 block">
              <span className="text-sm font-medium text-white/80">The places I miss most (names, one per line, 2 to 8)</span>
              <textarea
                className="mt-2 h-28 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#FFC43D] focus:outline-none"
                value={loves}
                onChange={(e) => setLoves(e.target.value)}
                placeholder={"My favorite cafe\nThe bar we always ended up at\nThat little bookshop"}
              />
            </label>
            <p className={`mt-2 text-sm ${typedCount > MAX_PLACES ? "text-[#FFC43D]" : "text-white/60"}`}>
              {typedCount} of {MAX_PLACES} places{typedCount > MAX_PLACES ? `. Only the first ${MAX_PLACES} will be used.` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={go} disabled={busy} className="rounded-full bg-[#FFC43D] px-7 py-3.5 font-semibold text-[#150B2E] transition hover:bg-white disabled:opacity-60">
                {busy ? "Matching your taste..." : "Find my matches"}
              </button>
              <button onClick={sample} className="rounded-full border border-white/30 px-6 py-3.5 font-medium text-white transition hover:bg-white/10">
                Try an example
              </button>
              <button onClick={sampleCorps} className="rounded-full border border-[#FFC43D]/60 px-6 py-3.5 font-medium text-[#FFC43D] transition hover:bg-[#FFC43D]/10">
                Corps member example
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-12">
        {error && <p className="rounded-2xl border border-[#E8A5A5] bg-[#FDECEC] p-4 text-[#7A1F1F]">{error}</p>}

        {!busy && !error && lanes.length === 0 && (
          <div className="grid gap-6 text-[#4A4166] sm:grid-cols-3">
            {[
              ["#FF5A5F", "Tell us two or three places you loved. A cafe, a bar, a bookshop, anything."],
              ["#7B5CFF", "Qloo's taste graph finds places in your new city that people with your taste love."],
              ["#0E9384", "You get matches in each part of life, with the place each one reminds you of."],
            ].map(([c, t]) => (
              <p key={t} className="border-l-4 pl-4" style={{ borderColor: c }}>{t}</p>
            ))}
          </div>
        )}

        {busy && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-[#E6E0F7]" />)}
          </div>
        )}

        {lanes.length > 0 && (
          <>
            <div className="relative overflow-hidden rounded-3xl bg-[#150B2E] text-white">
              {cityImage && <img src={cityImage} alt="" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover opacity-70" onError={(e) => (e.currentTarget.style.display = "none")} />}
              <div className="absolute inset-0 bg-gradient-to-t from-[#150B2E] via-[#150B2E]/50 to-transparent" />
              <div className="relative px-6 pb-8 pt-28 sm:px-10 sm:pt-44">
                <h2 className={`${D} text-3xl sm:text-5xl`}>We found {total} places in {shownCity} that fit you.</h2>
                <p className="mt-3 max-w-2xl text-white/85">
                  {compared === 0 ? "Each one is matched to the places you picked." : missed > 0 ? `${missed} of ${compared} would not show up on a list of popular spots. That is your taste at work.` : "Your taste lines up with the popular spots here."}
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([[total, `matches in ${shownCity}`], [lanes.flatMap((l) => l.items).filter((i) => i.exact).length, "same-brand places"], ...(compared > 0 ? [[missed, "not on a popular list"]] : []), [lanes.length, "of your places matched"]] as [number, string][]).map(([n, label]) => (
                <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
                  <div className={`${D} text-3xl`}>{n}</div>
                  <div className="text-sm text-[#6B6288]">{label}</div>
                </div>
              ))}
            </div>
            <p className="mt-5 flex flex-wrap items-center gap-2 text-sm text-[#4A4166]">
              <span>We matched your list to:</span>
              {understood.map((u) => (
                <span key={u.typed} className={`rounded-full px-3 py-1 ${u.matched ? "bg-white shadow-sm" : "bg-[#FDECEC] text-[#7A1F1F]"}`}>
                  {u.matched ?? `${u.typed} (not found)`}
                </span>
              ))}
            </p>
            {guessed && <p className="mt-2 text-sm text-[#8A5A00]">We could not find exact matches, so these results use the closest places we found.</p>}
            {understood.some((u) => !u.matched) && <p className="mt-2 text-sm text-[#8A5A00]">We could not find every place. Try the name as it appears on Google Maps, or a shorter version.</p>}
            {empty.length > 0 && <p className="mt-2 text-sm text-[#8A5A00]">We found nothing close to these in {shownCity}: {empty.join(", ")}.</p>}
            {skipped.length > 0 && <p className="mt-2 text-sm text-[#8A5A00]">We used the first {MAX_PLACES} places. Left out: {skipped.join(", ")}.</p>}
            {understood.filter((u) => !u.matched && u.suggestions?.length).map((u) => (
              <p key={u.typed} className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#4A4166]">
                <span>Did you mean, for {u.typed}:</span>
                {u.suggestions!.map((sg) => (
                  <button key={sg} onClick={() => setLoves(loves.split("\n").map((l) => (l.trim() === u.typed ? sg : l)).join("\n"))} className="rounded-full bg-white px-3 py-1 font-medium shadow-sm hover:bg-[#F1ECFF]">{sg}</button>
                ))}
                <span>Then press Find my matches again.</span>
              </p>
            ))}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-full bg-white p-1 shadow-sm" role="tablist">
                {([["you", "Matched to your taste"], ["popular", `Popular in ${shownCity}`], ["rising", "Rising now"]] as const).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => {
                      setMode(k);
                      if (k === "rising") loadRising();
                    }}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === k ? "bg-[#150B2E] text-white" : "text-[#4A4166] hover:bg-[#F1ECFF]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={shareCard} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#F1ECFF]">
                  <Share2 size={16} /> Share as picture
                </button>
                <button onClick={copy} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#F1ECFF]">
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy my list"}
              </button>
              </div>
            </div>
          </>
        )}

        {lanes.length > 0 && mode === "you" && seeds.length > 0 && (
          <section className="mt-12">
            <h3 className={`${D} text-2xl sm:text-3xl`}>Where in {shownCity} fits you</h3>
            <p className="mt-1 text-sm text-[#6B6288]">Stronger color means a stronger match with your taste.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[{ id: "all", name: "All my places" }, ...seeds].map((x) => (
                <button key={x.id} onClick={() => loadMap(x.id)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold ${mapFor === x.id ? "bg-[#150B2E] text-white" : "bg-white text-[#4A4166] shadow-sm hover:bg-[#F1ECFF]"}`}>
                  {x.name}
                </button>
              ))}
            </div>
            <div className="mt-4">
              {pins.length === 0 && mapPoints.length === 0 && mapState === "loading" && <div className="h-96 animate-pulse rounded-2xl bg-[#E6E0F7]" />}
              {pins.length === 0 && mapPoints.length === 0 && mapState !== "loading" && <p className="rounded-2xl bg-white p-5 text-[#6B6288] shadow-sm">We cannot draw a taste map for {shownCity} yet. Try a bigger city nearby.</p>}
              {(pins.length > 0 || mapPoints.length > 0) && <TasteMap points={mapPoints} pins={pins} color="#D6336C" />}
              {pins.length > 0 && <p className="mt-2 text-sm text-[#6B6288]">Each dot is one of your matches{mapFor === "all" ? ", colored by the place it matches" : ""}. Bigger dots are same-brand places. Hover or tap a dot to see its name.</p>}
            </div>
          </section>
        )}

        {lanes.length > 0 && mode === "you" && seeds.length > 0 && (
          <section className="print-area mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className={`${D} text-2xl sm:text-3xl`}>Your first month in {shownCity}</h3>
                <p className="mt-1 text-sm text-[#6B6288]">
                  {planCount > 0 ? `Tick things off as you go. ${doneCount} of ${planCount} done.` : `A plan for your first weeks, built from your places and from what Qloo knows about ${shownCity}.`}
                </p>
              </div>
              {planCount > 0 ? (
                <button onClick={() => window.print()} className="no-print inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#F1ECFF]">
                  <Printer size={16} /> Print or save as PDF
                </button>
              ) : (
                kitState !== "loading" && (
                  <button onClick={loadKit} className="no-print rounded-full bg-[#150B2E] px-6 py-3 font-semibold text-white hover:bg-[#1F6F8B]">
                    Build my first month
                  </button>
                )
              )}
            </div>
            {planCount > 0 && (
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#E6E0F7]">
                <div className="h-full rounded-full bg-[#7B5CFF] transition-all" style={{ width: `${(doneCount / planCount) * 100}%` }} />
              </div>
            )}
            {kitState === "loading" && (
              <div className="mt-6">
                <p className="text-sm text-[#6B6288]">Building your first month. This takes about 15 seconds.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#E6E0F7]" />)}</div>
              </div>
            )}
            {kitState === "none" && <p className="mt-6 rounded-2xl bg-white p-5 text-[#6B6288] shadow-sm">We could not build a plan for {shownCity} yet. Try a bigger city nearby.</p>}
            <div className="mt-6 space-y-8">
              {stages.filter((st) => st.tasks.length > 0).map((st) => (
                <div key={st.title}>
                  <div className="flex flex-wrap items-baseline gap-3 border-l-4 pl-3" style={{ borderColor: st.color }}>
                    <h4 className={`${D} text-xl`}>{st.title}</h4>
                    <span className="text-sm text-[#6B6288]">{st.sub}</span>
                  </div>
                  <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                    {st.tasks.map((t) => (
                      <li key={t.key} className="flex gap-3 rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(21,11,46,.06),0_10px_28px_-14px_rgba(21,11,46,.25)]">
                        <input type="checkbox" checked={!!done[t.key]} onChange={() => toggle(t.key)} className="mt-1 h-4 w-4 shrink-0 accent-[#7B5CFF]" />
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: st.color }}>
                          {t.item.image && <img src={t.item.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold" style={{ color: st.color }}>{t.label}</p>
                          <p className={`font-semibold leading-tight ${done[t.key] ? "text-[#8A83A3] line-through" : ""}`}>{t.item.name}</p>
                          <p className="text-xs text-[#6B6288]">{t.item.where ? `${t.item.where}. ` : ""}{t.note}</p>
                          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${t.item.name} ${shownCity}`)}`} target="_blank" rel="noreferrer" className="no-print mt-1 inline-flex items-center gap-1 text-xs font-semibold" style={{ color: st.color }}>
                            <MapPin size={12} /> Open in Maps
                          </a>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}

        {mode === "you" && lanes.map((lane, idx) => {
          const c = { ...PALETTE[idx % PALETTE.length], Icon: iconFor(lane.kind) };
          return (
            <section key={lane.id} className="mt-12">
              <h3 className={`${D} flex items-center gap-3 text-2xl sm:text-3xl`}>
                <span className="grid h-9 w-9 place-items-center rounded-full text-white" style={{ background: c.color }}><c.Icon size={18} /></span>
                {lane.title}
              </h3>
              <p className="mt-1 text-sm text-[#6B6288]">{lane.kind} in {shownCity}</p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {lane.items.map((it) => <Card key={it.id} it={it} c={c} mode={mode} city={shownCity} />)}
              </ul>
            </section>
          );
        })}

        {lanes.length > 0 && mode === "you" && seeds.length > 0 && (
          <section className="no-print mt-14">
            <h3 className={`${D} text-2xl sm:text-3xl`}>Music, shows and podcasts for {shownCity}</h3>
            <p className="mt-1 text-sm text-[#6B6288]">Picked from the places you loved, tuned to what people in {shownCity} like.</p>
            {culture.length === 0 && (
              <button onClick={loadCulture} disabled={cultureState === "loading"} className="mt-4 rounded-full bg-[#150B2E] px-6 py-3 font-semibold text-white hover:bg-[#1F6F8B] disabled:opacity-60">
                {cultureState === "loading" ? "Finding music and shows..." : "Show me"}
              </button>
            )}
            {cultureState === "none" && <p className="mt-4 rounded-2xl bg-white p-5 text-[#6B6288] shadow-sm">Nothing came back this time. Try again in a moment.</p>}
            {culture.map((g) => (
              <div key={g.id} className="mt-6">
                <h4 className={`${D} text-xl`}>{g.title}</h4>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {g.items.map((it) => (
                    <li key={it.id} className="overflow-hidden rounded-xl bg-white shadow-sm">
                      <div className="aspect-square bg-[#E6E0F7]">
                        {it.image && <img src={it.image} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />}
                      </div>
                      <p className="p-2 text-sm font-semibold leading-tight">{it.name}</p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        )}

        {mode === "rising" && lanes.length > 0 && (
          risingState === "loading" ? (
            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-[#E6E0F7]" />)}</div>
          ) : rising.length === 0 ? (
            <p className="mt-10 text-[#6B6288]">Rising places are not available for {shownCity} yet.</p>
          ) : (
            <section className="mt-12">
              <h3 className={`${D} text-2xl sm:text-3xl`}>Rising in {shownCity}</h3>
              <p className="mt-1 text-sm text-[#6B6288]">Places that fit your taste and are gaining attention right now.</p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {rising.map((it) => <Card key={it.id} it={it} c={{ color: "#D6336C", soft: "#FBDDE8", Icon: Sparkles }} mode="rising" city={shownCity} />)}
              </ul>
            </section>
          )
        )}

        {lanes.length > 0 && mode === "you" && seeds.length > 0 && (
          <section className="no-print mt-14">
            <h3 className={`${D} text-2xl sm:text-3xl`}>Miss a dish?</h3>
            <p className="mt-1 text-sm text-[#6B6288]">Type up to 3 foods you miss, separated by commas. Add the cuisine in brackets for better luck, like ekpang nkukwu (Nigerian).</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <input value={dishText} onChange={(e) => setDishText(e.target.value)} placeholder="jollof rice, ekpang nkukwu (Nigerian)" className={inputCls} />
              <button onClick={findDishes} disabled={dishState === "loading" || !dishText.trim()} className="rounded-full bg-[#150B2E] px-6 py-3 font-semibold text-white hover:bg-[#1F6F8B] disabled:opacity-60">
                {dishState === "loading" ? "Looking..." : `Find it in ${shownCity}`}
              </button>
            </div>
            {dishState === "none" && <p className="mt-4 rounded-2xl bg-white p-5 text-[#6B6288] shadow-sm">We could not search for dishes in {shownCity} right now. Try again in a moment.</p>}
            {dishGroups.map((g) => (
              <div key={g.dish} className="mt-6">
                <h4 className={`${D} text-xl`}>{g.dish}</h4>
                {g.note && <p className="mt-1 text-sm text-[#6B6288]">{g.note}</p>}
                {g.items.length === 0 ? (
                  <p className="mt-2 text-sm text-[#6B6288]">No place in {shownCity} lists {g.dish} in Qloo&apos;s data yet. Try another spelling, or add the cuisine in brackets, like (Nigerian).</p>
                ) : (
                  <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {g.items.map((it) => <Card key={it.id} it={it} c={DISH_STYLE} mode="dish" city={shownCity} />)}
                  </ul>
                )}
              </div>
            ))}
          </section>
        )}

        {lanes.length > 0 && mode === "you" && last && (
          <section className="no-print mt-14">
            <h3 className={`${D} text-2xl sm:text-3xl`}>Which city fits you better?</h3>
            <p className="mt-1 text-sm text-[#6B6288]">Choosing between two cities? Type the other one and we run the same places through it.</p>
            <div className="mt-4 flex flex-wrap gap-3">
              <input value={cmpCity} onChange={(e) => setCmpCity(e.target.value)} placeholder="Another city" className={inputCls} />
              <button onClick={compare} disabled={cmpState === "loading" || !cmpCity.trim()} className="rounded-full bg-[#150B2E] px-6 py-3 font-semibold text-white hover:bg-[#1F6F8B] disabled:opacity-60">
                {cmpState === "loading" ? "Comparing..." : "Compare"}
              </button>
            </div>
            {cmpState === "loading" && <p className="mt-3 text-sm text-[#6B6288]">Searching {cmpCity}. This takes about 20 seconds.</p>}
            {cmpState === "error" && <p className="mt-4 rounded-2xl border border-[#E8A5A5] bg-[#FDECEC] p-4 text-[#7A1F1F]">{cmpError}</p>}
            {cmp && (
              <div className="mt-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  {[{ city: shownCity, img: cityImage }, { city: cmp.city, img: cmp.cityImage }].map((col, ci) => (
                    <div key={`${col.city}-${ci}`} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                      <div className="relative h-28 bg-[#150B2E]">
                        {col.img && <img src={col.img} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover opacity-70" onError={(e) => (e.currentTarget.style.display = "none")} />}
                        <h4 className={`${D} absolute bottom-3 left-4 text-2xl text-white`}>{col.city}</h4>
                      </div>
                      <ul className="divide-y divide-[#EEE9FB]">
                        {cmpRows.map((r, ri) => (
                          <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                            <span className="text-[#4A4166]">{r.label}</span>
                            <span className={`${D} rounded-full px-3 py-1 text-xl ${cmpWinner[ri] === ci ? "bg-[#D5F2EE] text-[#0E6F63]" : ""}`}>{ci === 0 ? r.a : r.b}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="mt-4 font-semibold">
                  {winsA === winsB ? "Both cities fit you about the same." : `${winsA > winsB ? shownCity : cmp.city} fits you better on ${Math.max(winsA, winsB)} of ${cmpRows.length} counts.`}
                </p>
                <p className="mt-1 text-sm text-[#6B6288]">This only counts matches in Qloo&apos;s data. It does not weigh jobs, rent or safety.</p>
              </div>
            )}
          </section>
        )}

        {mode === "popular" && lanes.length > 0 && (
          popular.length === 0 ? (
            <p className="mt-10 text-[#6B6288]">Popular places are not available for {shownCity} yet.</p>
          ) : (
            <section className="mt-12">
              <h3 className={`${D} text-2xl sm:text-3xl`}>Popular in {shownCity}</h3>
              <p className="mt-1 text-sm text-[#6B6288]">What a generic guide would show. No taste input.</p>
              <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {popular.map((it) => <Card key={it.id} it={it} c={{ color: "#4A4166", soft: "#ECE8F7", Icon: Sparkles }} mode={mode} city={shownCity} />)}
              </ul>
            </section>
          )
        )}

        {lanes.length > 0 && <p className="mt-14 text-xs text-[#6B6288]">Taste data from Qloo.{cityImage ? " City photo from Wikipedia." : ""}</p>}
      </div>
    </main>
  );
}