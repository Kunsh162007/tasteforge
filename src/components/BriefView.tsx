import type { Brief, DroppedItem, SectionConfidence } from "@/ui/contract";
import { DroppedNote } from "./DroppedNote";
import { HotspotMapLoader } from "./HotspotMapLoader";
import { ItemList } from "./ItemList";
import { Section } from "./Section";
import { Swatches } from "./Swatches";
import { WhyChip } from "./WhyChip";

const spotifyUrl = (name: string) => `https://open.spotify.com/search/${encodeURIComponent(name)}`;

function GroundingBadge({ score, model }: { score: number; model?: string }) {
  const value = Math.round(score * 100);
  return (
    <div className="grounding" role="img" aria-label={`Grounding score ${value} percent`}>
      <span className="grounding__num" aria-hidden="true">
        {value}
        <small>%</small>
      </span>
      <span className="grounding__cap" aria-hidden="true">
        grounded in
        <br />
        Qloo evidence
        {model ? (
          <>
            <br />
            <span className="grounding__model" title="The language model that wrote this brief">
              written by {model.replace(/^[a-z]+:/, "")}
            </span>
          </>
        ) : null}
      </span>
    </div>
  );
}

export function BriefView({ brief, dropped }: { brief: Brief; dropped: readonly DroppedItem[] }) {
  const c: Partial<SectionConfidence> = brief.sectionConfidence ?? {};
  const modeLabel = brief.mode === "know_audience" ? "Known audience" : "Audience found for you";
  return (
    <article className="brief" aria-labelledby="brief-title">
      <header className="brief__masthead">
        <div>
          <p className="brief__kicker">Cultural brief, {modeLabel.toLowerCase()}</p>
          <h1 id="brief-title" className="brief__title">
            {brief.title}
          </h1>
        </div>
        <GroundingBadge score={brief.groundingScore} model={brief.model} />
      </header>

      <Section id="audience" title="The audience" confidence={c.audience}>
        <p className="lede">{brief.audienceProfile.summary}</p>
        <h3 className="subhead">What they love</h3>
        <ItemList items={brief.audienceProfile.affinities} path="audienceProfile.affinities" />
        {brief.audienceProfile.demographics?.length ? (
          <>
            <h3 className="subhead">Who they are</h3>
            <ItemList items={brief.audienceProfile.demographics} />
          </>
        ) : null}
      </Section>

      <Section id="aesthetic" title="The look" confidence={c.aesthetic}>
        <Swatches palette={brief.aesthetic.palette} />
        <div className="cols">
          <div>
            <h3 className="subhead">Lighting</h3>
            <ItemList items={brief.aesthetic.lighting} path="aesthetic.lighting" />
          </div>
          <div>
            <h3 className="subhead">Materials</h3>
            <ItemList items={brief.aesthetic.materials} path="aesthetic.materials" />
          </div>
        </div>
        <h3 className="subhead">Places that set the tone</h3>
        <ItemList items={brief.aesthetic.referencePlaces} path="aesthetic.referencePlaces" />
      </Section>

      <Section id="sound" title="The sound" confidence={c.sound}>
        <p className="lede">{brief.sound.direction}</p>
        <ItemList
          items={brief.sound.artists}
          path="sound.artists"
          extra={(item) => (
            <a className="link-quiet" href={spotifyUrl(item.label)} target="_blank" rel="noopener noreferrer">
              Open in Spotify<span className="sr-only"> (search for {item.label}, opens in a new tab)</span>
            </a>
          )}
        />
      </Section>

      <Section id="pairings" title="Pairings" confidence={c.pairings}>
        <ItemList items={brief.pairings} path="pairings" />
      </Section>

      {brief.whereTheyAre ? (
        <Section id="where" title={`Where they are, ${brief.whereTheyAre.city}`} confidence={c.where}>
          <HotspotMapLoader brief={brief} />
          <ItemList items={brief.whereTheyAre.hotspots} path="whereTheyAre.hotspots" />
        </Section>
      ) : null}

      <Section id="messaging" title="How to talk to them">
        <p className="lede">
          {brief.messaging.tone} <WhyChip ids={brief.messaging.evidence} label="Messaging tone" />
        </p>
        <ul className="phrases">
          {brief.messaging.phrases.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </Section>

      <DroppedNote dropped={dropped} />
    </article>
  );
}
