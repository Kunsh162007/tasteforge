"use client";

import type { ReactNode } from "react";
import type { SlotPath } from "@/lib/agent/briefItems";
import type { Item } from "@/ui/contract";
import { useFeedback } from "./FeedbackContext";
import { ItemFeedback } from "./ItemFeedback";
import { WhyChip } from "./WhyChip";

export function ItemList({
  items,
  extra,
  path,
}: {
  items: readonly Item[];
  extra?: (item: Item) => ReactNode;
  /** Which brief list this is; enables the like / dislike / lock controls. */
  path?: SlotPath;
}) {
  const feedback = useFeedback();
  if (items.length === 0) return <p className="muted">Nothing grounded for this part.</p>;
  return (
    <ul className="items">
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
