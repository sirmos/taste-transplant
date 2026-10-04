"use client";
import { useState } from "react";
import { Coffee, Wine, Music, BookOpen, Shirt, MapPin, Copy, Check, Trophy, ShoppingBag, Utensils, Bed, TreePine, Landmark, Scissors, Sparkles } from "lucide-react";

type Item = { id: string; name: string; image: string; where: string; description: string; tags: string[]; shared?: string[]; exact?: boolean };
type Lane = { id: string; title: string; kind: string; items: Item[] };
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
const D = "font-[family-name:var(--font-display)]";
const slot = "field-sizing-content min-w-[7ch] border-b-2 border-[#FFC43D] bg-transparent px-1 text-[#FFC43D] placeholder:text-[#FFC43D]/40 focus:border-white focus:text-white focus:outline-none";

type Style = { color: string; soft: string; Icon: typeof Coffee };
function Card({ it, c, mode, city }: { it: Item; c: Style; mode: "you" | "popular"; city: string }) {
  const pill = mode === "popular" ? "Popular pick" : it.exact ? "Same brand" : "";
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
        <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${it.name} ${city}`)}`} target="_blank" rel="noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold" style={{ color: c.color }}>
          <MapPin size={14} /> Open in Maps
        </a>
      </div>
    </li>
  );
}

export default function Home() {
  const [home, setHome] = useState("");
  const [next, setNext] = useState("");
  const [loves, setLoves] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [popular, setPopular] = useState<Item[]>([]);
  const [understood, setUnderstood] = useState<Understood[]>([]);
  const [shownCity, setShownCity] = useState("");
  const [cityImage, setCityImage] = useState("");
  const [guessed, setGuessed] = useState(false);
  const [mode, setMode] = useState<"you" | "popular">("you");
  const [copied, setCopied] = useState(false);

  const total = lanes.reduce((n, l) => n + l.items.length, 0);
  const compared = popular.length > 0 ? total : 0;
  const popularIds = new Set(popular.map((p) => p.id));
  const missed = lanes.flatMap((l) => l.items).filter((i) => !popularIds.has(i.id)).length;

  function sample() {
    setHome("Toronto");
    setNext("Chicago");
    setLoves("St. Lawrence Market\nKensington Market\nBellwoods Brewery");
  }

  function copy() {
    const text = lanes.map((l) => `${l.title}\n` + l.items.map((i) => `- ${i.name}${i.where ? ` (${i.where})` : ""}`).join("\n")).join("\n\n");
    navigator.clipboard.writeText(`My taste, moved to ${shownCity}\n\n${text}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function go() {
    setBusy(true);
    setError("");
    setLanes([]);
    setMode("you");
    try {
      const res = await fetch("/api/transplant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ homeCity: home, newCity: next, loves: loves.split("\n") }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
      setLanes(data.lanes);
      setPopular(data.popular ?? []);
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

          <div className="mt-10 max-w-3xl">
            <p className={`${D} text-3xl leading-snug sm:text-4xl`}>
              I moved from <input className={slot} value={home} onChange={(e) => setHome(e.target.value)} placeholder="Toronto" aria-label="City you moved from" /> to{" "}
              <input className={slot} value={next} onChange={(e) => setNext(e.target.value)} placeholder="Chicago" aria-label="City you moved to" />.
            </p>
            <label className="mt-6 block">
              <span className="text-sm font-medium text-white/80">The places I miss most (one per line, at least 2)</span>
              <textarea
                className="mt-2 h-28 w-full rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-white placeholder:text-white/40 focus:border-[#FFC43D] focus:outline-none"
                value={loves}
                onChange={(e) => setLoves(e.target.value)}
                placeholder={"My favorite cafe\nThe bar we always ended up at\nThat little bookshop"}
              />
            </label>
            <div className="mt-5 flex flex-wrap gap-3">
              <button onClick={go} disabled={busy} className="rounded-full bg-[#FFC43D] px-7 py-3.5 font-semibold text-[#150B2E] transition hover:bg-white disabled:opacity-60">
                {busy ? "Matching your taste..." : "Find my matches"}
              </button>
              <button onClick={sample} className="rounded-full border border-white/30 px-6 py-3.5 font-medium text-white transition hover:bg-white/10">
                Try an example
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
                {([["you", "Matched to your taste"], ["popular", `Popular in ${shownCity}`]] as const).map(([k, label]) => (
                  <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition ${mode === k ? "bg-[#150B2E] text-white" : "text-[#4A4166] hover:bg-[#F1ECFF]"}`}>
                    {label}
                  </button>
                ))}
              </div>
              <button onClick={copy} className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold shadow-sm hover:bg-[#F1ECFF]">
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy my list"}
              </button>
            </div>
          </>
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