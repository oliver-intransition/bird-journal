"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";

interface Sighting {
  id: string;
  species: string;
  location: string;
  date: string;
  count: number;
  notes: string;
}

type Tab = "log" | "locations" | "species";

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function today() {
  return new Date().toISOString().split("T")[0];
}

export default function Home() {
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("log");

  // Form state
  const [species, setSpecies] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState(today);
  const [count, setCount] = useState("1");
  const [notes, setNotes] = useState("");
  const [flash, setFlash] = useState(false);

  // Expanded locations
  const [expandedLocs, setExpandedLocs] = useState<Set<string>>(new Set());
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("sightings")
      .select("*")
      .then(({ data }) => {
        if (data) setSightings(data);
        setLoading(false);
      });
  }, []);

  async function addSighting() {
    if (!species.trim() || !location.trim() || !date) return;
    const s: Sighting = {
      id: uid(),
      species: species.trim(),
      location: location.trim(),
      date,
      count: Math.max(1, parseInt(count) || 1),
      notes: notes.trim(),
    };
    await supabase.from("sightings").insert(s);
    setSightings((prev) => [...prev, s]);
    setSpecies("");
    setNotes("");
    setCount("1");
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
  }

  async function deleteSighting(id: string) {
    await supabase.from("sightings").delete().eq("id", id);
    setSightings((prev) => prev.filter((s) => s.id !== id));
  }

  function exportData() {
    const json = JSON.stringify(sightings, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `field-journal-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importData(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const imported: Sighting[] = JSON.parse(reader.result as string);
        const existingIds = new Set(sightings.map((s) => s.id));
        const newSightings = imported.filter((s) => !existingIds.has(s.id));
        if (newSightings.length > 0) {
          await supabase.from("sightings").insert(newSightings);
          setSightings((prev) => [...prev, ...newSightings]);
        }
      } catch {}
      if (importRef.current) importRef.current.value = "";
    };
    reader.readAsText(file);
  }

  const knownSpecies = useMemo(
    () => Array.from(new Set(sightings.map((s) => s.species))).sort(),
    [sightings]
  );

  const knownLocations = useMemo(
    () => Array.from(new Set(sightings.map((s) => s.location))).sort(),
    [sightings]
  );

  const byLocation = useMemo(() => {
    const map = new Map<string, Sighting[]>();
    for (const s of sightings) {
      if (!map.has(s.location)) map.set(s.location, []);
      map.get(s.location)!.push(s);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([loc, birds]) => ({
        location: loc,
        totalSpecies: new Set(birds.map((b) => b.species)).size,
        totalIndividuals: birds.reduce((sum, b) => sum + b.count, 0),
        sightings: [...birds].sort((a, b) => {
          const sc = a.species.localeCompare(b.species);
          return sc !== 0 ? sc : a.date.localeCompare(b.date);
        }),
      }));
  }, [sightings]);

  const allSpecies = useMemo(() => {
    const map = new Map<
      string,
      { totalCount: number; locations: Set<string>; firstSeen: string; lastSeen: string }
    >();
    for (const s of sightings) {
      if (!map.has(s.species)) {
        map.set(s.species, {
          totalCount: 0,
          locations: new Set(),
          firstSeen: s.date,
          lastSeen: s.date,
        });
      }
      const e = map.get(s.species)!;
      e.totalCount += s.count;
      e.locations.add(s.location);
      if (s.date < e.firstSeen) e.firstSeen = s.date;
      if (s.date > e.lastSeen) e.lastSeen = s.date;
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sp, data]) => ({
        species: sp,
        totalCount: data.totalCount,
        locationCount: data.locations.size,
        locations: Array.from(data.locations).sort(),
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      }));
  }, [sightings]);

  function toggleLocation(loc: string) {
    setExpandedLocs((prev) => {
      const next = new Set(prev);
      if (next.has(loc)) next.delete(loc);
      else next.add(loc);
      return next;
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "log", label: "Log" },
    { id: "locations", label: "Locations" },
    { id: "species", label: "All Species" },
  ];

  const inputClass =
    "w-full rounded-lg border border-sand bg-parchment px-3 py-2 text-sm text-bark placeholder:text-stone/40 focus:outline-none focus:border-moss transition-colors";

  return (
    <div className="min-h-screen bg-parchment text-bark">
      {/* Header */}
      <header className="bg-surface border-b border-sand px-6 py-4">
        <div className="mx-auto max-w-2xl flex items-center gap-3">
          <span className="text-xl">🪶</span>
          <div>
            <h1 className="text-base font-semibold tracking-tight text-bark leading-tight">
              Field Journal
            </h1>
            <p className="text-xs text-stone">Bird sighting record</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex gap-2">
              <button
                onClick={exportData}
                disabled={sightings.length === 0}
                className="text-xs text-stone hover:text-moss transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Export
              </button>
              <span className="text-sand">|</span>
              <button
                onClick={() => importRef.current?.click()}
                className="text-xs text-stone hover:text-moss transition-colors"
              >
                Import
              </button>
              <input ref={importRef} type="file" accept=".json" onChange={importData} className="sr-only" />
            </div>
            <div className="text-right">
              <p className="text-xl font-light text-moss leading-tight">{allSpecies.length}</p>
              <p className="text-xs text-stone">species</p>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-surface border-b border-sand px-6">
        <div className="mx-auto max-w-2xl flex">
          {tabs.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                tab === id
                  ? "border-moss text-moss"
                  : "border-transparent text-stone hover:text-bark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>

      <main className="mx-auto max-w-2xl px-6 py-8">
        {loading ? (
          <div className="text-center py-16 text-stone">
            <p className="text-3xl mb-3">🪶</p>
            <p className="text-sm">Loading your journal…</p>
          </div>
        ) : (
          <>
            {/* ── LOG TAB ── */}
            {tab === "log" && (
              <div className="space-y-6">
                <div className="bg-surface rounded-2xl border border-sand p-6 space-y-4">
                  <h2 className="text-xs font-semibold text-stone uppercase tracking-widest">
                    New Sighting
                  </h2>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone" htmlFor="species">
                      Species
                    </label>
                    <input
                      id="species"
                      type="text"
                      list="species-list"
                      value={species}
                      onChange={(e) => setSpecies(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSighting()}
                      placeholder="e.g. Robin, Blackbird, Kingfisher…"
                      className={inputClass}
                    />
                    <datalist id="species-list">
                      {knownSpecies.map((s) => (
                        <option key={s} value={s} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone" htmlFor="location">
                      Location
                    </label>
                    <input
                      id="location"
                      type="text"
                      list="location-list"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addSighting()}
                      placeholder="e.g. Hyde Park, Costa Rica…"
                      className={inputClass}
                    />
                    <datalist id="location-list">
                      {knownLocations.map((l) => (
                        <option key={l} value={l} />
                      ))}
                    </datalist>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone" htmlFor="date">
                        Date
                      </label>
                      <input
                        id="date"
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-stone" htmlFor="count">
                        Count
                      </label>
                      <input
                        id="count"
                        type="number"
                        min="1"
                        value={count}
                        onChange={(e) => setCount(e.target.value)}
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-stone" htmlFor="notes">
                      Notes{" "}
                      <span className="text-stone/50 font-normal">(optional)</span>
                    </label>
                    <textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Behaviour, plumage, habitat…"
                      rows={2}
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <button
                    onClick={addSighting}
                    disabled={!species.trim() || !location.trim()}
                    className={`w-full rounded-lg py-2.5 text-sm font-semibold transition-colors ${
                      flash
                        ? "bg-moss-light text-moss border border-moss/30"
                        : "bg-moss text-surface disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
                    }`}
                  >
                    {flash ? "✓  Recorded" : "Record Sighting"}
                  </button>
                </div>

                {sightings.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-stone uppercase tracking-widest">
                      Recent
                    </h3>
                    <div className="bg-surface rounded-2xl border border-sand divide-y divide-sand/60 overflow-hidden">
                      {[...sightings]
                        .reverse()
                        .slice(0, 8)
                        .map((s) => (
                          <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                            <span className="text-sm">🐦</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-bark truncate">{s.species}</p>
                              <p className="text-xs text-stone">
                                {s.location} · {formatDate(s.date)}
                                {s.count > 1 && ` · ×${s.count}`}
                              </p>
                            </div>
                            <button
                              onClick={() => deleteSighting(s.id)}
                              className="text-stone/30 hover:text-red-400 transition-colors text-lg leading-none px-1"
                              aria-label="Delete sighting"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {sightings.length === 0 && (
                  <EmptyState message="Your first sighting will appear here." />
                )}
              </div>
            )}

            {/* ── LOCATIONS TAB ── */}
            {tab === "locations" && (
              <div className="space-y-3">
                {byLocation.length === 0 ? (
                  <EmptyState message="No sightings yet. Use the Log tab to record your first bird." />
                ) : (
                  <>
                    <p className="text-xs text-stone">
                      {byLocation.length} location{byLocation.length !== 1 ? "s" : ""}
                    </p>
                    {byLocation.map(({ location, totalSpecies, totalIndividuals, sightings: birds }) => {
                      const isOpen = expandedLocs.has(location);
                      return (
                        <div
                          key={location}
                          className="bg-surface rounded-2xl border border-sand overflow-hidden"
                        >
                          <button
                            onClick={() => toggleLocation(location)}
                            className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-parchment transition-colors"
                          >
                            <span className="text-sm">📍</span>
                            <div className="flex-1">
                              <p className="font-medium text-bark">{location}</p>
                              <p className="text-xs text-stone">
                                {totalSpecies} species · {totalIndividuals} individuals
                              </p>
                            </div>
                            <span
                              className={`text-stone text-xs transition-transform duration-200 ${
                                isOpen ? "rotate-180" : ""
                              }`}
                            >
                              ▾
                            </span>
                          </button>

                          {isOpen && (
                            <div className="border-t border-sand divide-y divide-sand/50">
                              {birds.map((s) => (
                                <div key={s.id} className="flex items-center gap-3 px-5 py-3">
                                  <span className="text-sm w-5 text-center">🐦</span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-bark">{s.species}</p>
                                    {s.notes && (
                                      <p className="text-xs text-stone italic truncate">{s.notes}</p>
                                    )}
                                  </div>
                                  <div className="flex-shrink-0 text-right">
                                    <p className="text-xs text-stone">{formatDate(s.date)}</p>
                                    {s.count > 1 && (
                                      <p className="text-xs text-moss font-medium">×{s.count}</p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => deleteSighting(s.id)}
                                    className="text-stone/30 hover:text-red-400 transition-colors text-lg leading-none ml-1 px-1"
                                    aria-label="Delete"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            )}

            {/* ── SPECIES TAB ── */}
            {tab === "species" && (
              <div className="space-y-3">
                {allSpecies.length === 0 ? (
                  <EmptyState message="No sightings yet. Use the Log tab to record your first bird." />
                ) : (
                  <>
                    <p className="text-xs text-stone">
                      {allSpecies.length} species across {byLocation.length} location
                      {byLocation.length !== 1 ? "s" : ""}
                    </p>
                    <div className="bg-surface rounded-2xl border border-sand divide-y divide-sand/60 overflow-hidden">
                      {allSpecies.map(
                        ({ species, totalCount, locationCount, locations, firstSeen, lastSeen }) => (
                          <div key={species} className="flex items-start gap-3 px-5 py-4">
                            <span className="text-sm mt-0.5">🐦</span>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-bark">{species}</p>
                              <p className="text-xs text-stone">
                                {locationCount === 1
                                  ? locations[0]
                                  : `${locationCount} locations`}
                                {firstSeen !== lastSeen
                                  ? ` · ${formatDate(firstSeen)} – ${formatDate(lastSeen)}`
                                  : ` · ${formatDate(firstSeen)}`}
                              </p>
                              {locationCount > 1 && (
                                <p className="text-xs text-stone/60 mt-0.5 truncate">
                                  {locations.join(", ")}
                                </p>
                              )}
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="text-lg font-light text-moss leading-none">{totalCount}</p>
                              <p className="text-xs text-stone">seen</p>
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-stone">
      <p className="text-3xl mb-3">🪺</p>
      <p className="text-sm">{message}</p>
    </div>
  );
}
