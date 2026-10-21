import type { CSSProperties } from "react";
import type { Brief, DroppedItem, SectionConfidence } from "@/ui/contract";
import { DroppedNote } from "./DroppedNote";
import { HotspotMapLoader } from "./HotspotMapLoader";
import { ItemList } from "./ItemList";
import { Section } from "./Section";
import { inkFor, Swatches } from "./Swatches";
import { WhyChip } from "./WhyChip";

const spotifyUrl = (name: string) => `https://open.spotify.com/search/${encodeURIComponent(name)}`;

function GroundingBadge({ score, model }: { score: number; model?: string }) {
  const value = Math.round(score * 100);
  return (
    <div className="grounding" role="img" aria-label={`Citation coverage ${value} percent`}>
      <span className="grounding__num" aria-hidden="true">
        {value}
        <small>%</small>
      </span>
      <span className="grounding__cap" aria-hidden="true">
        of lines cite a Qloo record
        {model ? (
          <span className="grounding__model" title="The language model that wrote this brief">
            written by {model.replace(/^[a-z]+:/, "")}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** The cover: title over the brief's own palette, drawn as bands. */
function Cover({ brief }: { brief: Brief }) {
  const modeLabel = brief.mode === "know_audience" ? "Known audience" : "Audience found for you";
  const city = brief.whereTheyAre?.city;
  const bands = brief.aesthetic.palette.slice(0, 6);
  return (
    <header className="cover">
      <div className="cover__top">
        <div className="cover__main">
          <p className="cover__kicker">
            Cultural brief, {modeLabel.toLowerCase()}
            {city ? `, ${city}` : ""}
          </p>
          <h1 id="brief-title" className="cover__title">
            {brief.title}
          </h1>
        </div>
        <GroundingBadge score={brief.groundingScore} model={brief.model} />
      </div>
      {bands.length > 0 ? (
        <div className="cover__bands" aria-hidden="true">
          {bands.map((s, i) => (
            <span key={`${s.hex}-${s.label}`} className="cover__band" style={{ background: s.hex, color: inkFor(s.hex), "--i": i } as CSSProperties}>
              <span>{s.label}</span>
            </span>
          ))}
        </div>
      ) : null}
    </header>
  );
}

type NavLink = { href: string; label: string };

function BriefNav({ brief, hasProof }: { brief: Brief; hasProof: boolean }) {
  const links: NavLink[] = [
    { href: "#audience", label: "Audience" },
    { href: "#aesthetic", label: "Look" },
    { href: "#sound", label: "Sound" },
    { href: "#pairings", label: "Pairings" },
    ...(brief.whereTheyAre ? [{ href: "#where", label: "Where" }] : []),
    { href: "#messaging", label: "Voice" },
    ...(hasProof ? [{ href: "#proof", label: "Taste proof" }] : []),
    { href: "#monday", label: "Monday list" },
  ];
  return (
    <nav className="brief__nav" aria-label="In this brief">
      <ul>
        {links.map((l) => (
          <li key={l.href}>
            <a href={l.href}>{l.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function BriefView({ brief, dropped, hasProof = false }: { brief: Brief; dropped: readonly DroppedItem[]; hasProof?: boolean }) {
  const c: Partial<SectionConfidence> = brief.sectionConfidence ?? {};
  const aesthetic = brief.aesthetic;
  return (
    <article className="brief" aria-labelledby="brief-title">
      <Cover brief={brief} />
      <BriefNav brief={brief} hasProof={hasProof} />

      <Section id="audience" title="The audience" confidence={c.audience}>
        <p className="lede">{brief.audienceProfile.summary}</p>
        <h3 className="subhead">What they love</h3>
        <ItemList
          items={brief.audienceProfile.affinities}
          path="audienceProfile.affinities"
          variant="cards"
          empty="Qloo did not return enough shared interests to list here. The summary above is the writer's reading, not a measured result."
        />
        {brief.audienceProfile.demographics?.length ? (
          <>
            <h3 className="subhead">Who they are</h3>
            <ItemList items={brief.audienceProfile.demographics} />
          </>
        ) : null}
      </Section>

      <Section id="aesthetic" title="The look" confidence={c.aesthetic}>
        <Swatches palette={aesthetic.palette} />
        <div className="cols">
          <div>
            <h3 className="subhead">Lighting</h3>
            <ItemList
              items={aesthetic.lighting}
              path="aesthetic.lighting"
              empty="No lighting or ambience tags came back for this audience."
            />
          </div>
          <div>
            <h3 className="subhead">Materials</h3>
            <ItemList
              items={aesthetic.materials}
              path="aesthetic.materials"
              empty="No decor or material tags came back for this audience."
            />
          </div>
        </div>
        <h3 className="subhead">Places that set the tone</h3>
        <ItemList
          items={aesthetic.referencePlaces}
          path="aesthetic.referencePlaces"
          variant="places"
          empty="Qloo did not surface reference places for this audience."
        />
      </Section>

      <Section id="sound" title="The sound" confidence={c.sound}>
        <div className="playlist">
          <p className="playlist__kicker">Listening direction</p>
          <p className="playlist__direction">{brief.sound.direction}</p>
          <ItemList
            items={brief.sound.artists}
            path="sound.artists"
            variant="tracks"
            empty="Qloo did not return artists this audience loves, so there is no playlist to show."
            extra={(item) => (
              <a className="link-quiet" href={spotifyUrl(item.label)} target="_blank" rel="noopener noreferrer">
                Open in Spotify<span className="sr-only"> (search for {item.label}, opens in a new tab)</span>
              </a>
            )}
          />
        </div>
      </Section>

      <Section id="pairings" title="Pairings" confidence={c.pairings}>
        <ItemList
          items={brief.pairings}
          path="pairings"
          variant="cards"
          empty="No menu, merch or brand pairings were strong enough to keep. They were left out rather than invented."
        />
      </Section>

      {brief.whereTheyAre ? (
        <Section id="where" title={`Where they are, ${brief.whereTheyAre.city}`} confidence={c.where}>
          <HotspotMapLoader brief={brief} />
          <ItemList
            items={brief.whereTheyAre.hotspots}
            path="whereTheyAre.hotspots"
            variant="places"
            empty={`Qloo did not find areas of ${brief.whereTheyAre.city} where this audience concentrates.`}
          />
        </Section>
      ) : null}

      <Section id="messaging" title="How to talk to them">
        <p className="lede">
          {brief.messaging.tone} <WhyChip ids={brief.messaging.evidence} label="Messaging tone" />
        </p>
        {brief.messaging.phrases.length > 0 ? (
          <ul className="phrases">
            {brief.messaging.phrases.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </Section>

      <DroppedNote dropped={dropped} />
      <p className="brief__colophon">
        Prepared with TasteForge from Qloo taste-graph evidence. Qloo chose every artist, place, brand and style tag in this brief; a language model wrote the
        colour names, captions and copy lines around them. Every line cites a Qloo record, and lines without one were removed.
      </p>
    </article>
  );
}
