"use client";

import type { ReactNode } from "react";
import type { SlotPath } from "@/lib/agent/briefItems";
import type { Item } from "@/ui/contract";
import { useFeedback } from "./FeedbackContext";
import { ItemFeedback } from "./ItemFeedback";
import { Thin } from "./Section";
import { WhyChip } from "./WhyChip";

/** rows: ruled list. cards: bordered tiles. places: tiles with a pin. tracks: numbered playlist rows. */
export type ItemVariant = "rows" | "cards" | "places" | "tracks";

function Pin() {
  return (
    <svg className="item__pin" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M10 1.5a6 6 0 0 0-6 6c0 4.2 6 11 6 11s6-6.8 6-11a6 6 0 0 0-6-6Zm0 8.2a2.2 2.2 0 1 1 0-4.4 2.2 2.2 0 0 1 0 4.4Z" fill="currentColor" />
    </svg>
  );
}

export function ItemList({
  items,
  extra,
  path,
  variant = "rows",
  empty = "Nothing grounded for this part.",
}: {
  items: readonly Item[];
  extra?: (item: Item) => ReactNode;
  /** Which brief list this is; enables the like / dislike / lock controls. */
  path?: SlotPath;
  variant?: ItemVariant;
  /** Shown when the list is empty: say what is missing, not just that it is. */
  empty?: string;
}) {
  const feedback = useFeedback();
  if (items.length === 0) return <Thin>{empty}</Thin>;
  return (
    <ul className="items" data-variant={variant}>
      {items.map((item) => {
        const state = path && feedback ? feedback.stateOf(path, item) : undefined;
        return (
          <li
            key={`${item.label}-${item.qlooId ?? ""}`}
            className="item"
            data-mark={state?.mark}
            data-locked={state?.locked ? "true" : undefined}
            data-changed={state?.changed ? "true" : undefined}
          >
            {variant === "places" ? <Pin /> : null}
            <div className="item__main">
              <span className="item__label">{item.label}</span>
              {item.detail ? <span className="item__detail">{item.detail}</span> : null}
              {state?.changed ? <span className="item__new">New</span> : null}
            </div>
            <div className="item__actions">
              {extra?.(item)}
              <WhyChip ids={item.evidence} label={item.label} />
              {path ? <ItemFeedback path={path} item={item} /> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
