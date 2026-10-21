"use client";

import { useMemo, useState } from "react";
import { buildMondayList, isEmptyMonday } from "@/lib/mondayList";
import { mondayHtml, mondayText } from "@/lib/mondayExport";
import type { Brief } from "@/ui/contract";
import { paletteToPng, saveBlob } from "@/ui/paletteImage";
import { useEvidenceRecords } from "./EvidenceContext";

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "brief";

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="monday__block">
      <h3 className="monday__h">{title}</h3>
      {children}
    </section>
  );
}

/**
 * One page a founder can act on Monday morning: a playlist, the palette, three rooms to visit, two menu ideas, three
 * lines of copy and the neighbourhoods for flyers. Download it, copy it or print just this page.
 */
export function MondayList({ brief }: { brief: Brief }) {
  const evidence = useEvidenceRecords();
  const list = useMemo(() => buildMondayList(brief, evidence), [brief, evidence]);
  const [notice, setNotice] = useState<string>();
  if (isEmptyMonday(list)) return null;

  const say = (text: string): void => setNotice(text);
  const downloadList = (): void => {
    saveBlob(new Blob([mondayHtml(list)], { type: "text/html" }), `monday-list-${slug(list.title)}.html`);
    say("Saved. Open the file in any browser and print it on one page.");
  };
  const copyText = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(mondayText(list));
      say("Copied as plain text.");
    } catch {
      say("Copying was blocked by the browser. Use the download instead.");
    }
  };
  const downloadPalette = async (): Promise<void> => {
    const png = await paletteToPng(list.palette, list.title);
    if (!png) return say("This browser cannot draw the palette image.");
    saveBlob(png, `palette-${slug(list.title)}.png`);
    say("Palette image saved.");
  };
  const printList = (): void => {
    const body = document.body;
    body.dataset.printOnly = "monday";
    const done = (): void => {
      delete body.dataset.printOnly;
      window.removeEventListener("afterprint", done);
    };
    window.addEventListener("afterprint", done);
    window.print();
  };

  return (
    <section id="monday" className="monday" aria-labelledby="monday-h">
      <header className="monday__head">
        <p className="monday__kicker">For Monday morning</p>
        <h2 id="monday-h" className="monday__title">
          Your Monday list
        </h2>
        <p className="monday__sub">
          {list.title}
          {list.city ? `, ${list.city}` : ""}. Six things to do this week, each taken from the brief above.
        </p>
        <div className="monday__actions">
          <button type="button" className="btn-primary" onClick={downloadList}>
            Download the list
          </button>
          <button type="button" className="link-quiet" onClick={printList}>
            Print this page
          </button>
          <button type="button" className="link-quiet" onClick={() => void copyText()}>
            Copy as text
          </button>
        </div>
        <p className="monday__notice" role="status">
          {notice}
        </p>
      </header>

      <div className="monday__grid">
        {list.playlist.length > 0 ? (
          <Block title="1. Press play">
            <p className="monday__hint">A playlist to start from. Each name opens a Spotify search.</p>
            <ol className="monday__list">
              {list.playlist.map((p) => (
                <li key={p.name}>
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    {p.name}
                    <span className="sr-only"> (search on Spotify, opens in a new tab)</span>
                  </a>
                </li>
              ))}
            </ol>
          </Block>
        ) : null}

        {list.palette.length > 0 ? (
          <Block title="2. Paint and style">
            <ul className="monday__chips">
              {list.palette.map((c) => (
                <li key={`${c.hex}-${c.name}`}>
                  <span className="monday__chip" style={{ background: c.hex }} aria-hidden="true" />
                  <span>{c.name}</span>
                  <code>{c.hex}</code>
                </li>
              ))}
            </ul>
            <button type="button" className="link-quiet monday__noprint" onClick={() => void downloadPalette()}>
              Download the palette as a PNG
            </button>
          </Block>
        ) : null}

        {list.places.length > 0 ? (
          <Block title="3. Visit three rooms">
            <ul className="monday__list">
              {list.places.map((p) => (
                <li key={p.name}>
                  <strong>{p.name}</strong>
                  {p.where ? <span className="monday__where">{p.where}</span> : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        {list.menu.length > 0 ? (
          <Block title="4. Put two things on the board">
            <ul className="monday__list">
              {list.menu.map((m) => (
                <li key={m.name}>
                  <strong>{m.name}</strong>
                  {m.why ? <span className="monday__where">{m.why}</span> : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}

        {list.copy.length > 0 ? (
          <Block title="5. Say it three ways">
            <ul className="monday__list">
              {list.copy.map((c) => (
                <li key={c}>&ldquo;{c}&rdquo;</li>
              ))}
            </ul>
          </Block>
        ) : null}

        {list.flyers.length > 0 ? (
          <Block title="6. Hand out flyers in">
            <ul className="monday__list">
              {list.flyers.map((f) => (
                <li key={f.name}>
                  <strong>{f.name}</strong>
                  {f.note ? <span className="monday__where">{f.note}</span> : null}
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
      </div>
    </section>
  );
}
