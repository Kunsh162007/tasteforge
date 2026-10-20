"use client";

import { createContext, useContext } from "react";
import type { SlotPath } from "@/lib/agent/briefItems";
import type { Item } from "@/ui/contract";
import type { Mark } from "@/ui/feedback";

/** Lets list components show and change the like / dislike / lock marks without prop drilling. */

export type ItemFeedbackState = {
  mark?: Mark;
  locked: boolean;
  /** New in the last refine run (gets the entrance animation). */
  changed: boolean;
};

export type FeedbackApi = {
  stateOf: (path: SlotPath, item: Item) => ItemFeedbackState;
  toggleMark: (path: SlotPath, item: Item, mark: Mark) => void;
  toggleLock: (path: SlotPath, item: Item) => void;
};

export const FeedbackContext = createContext<FeedbackApi | null>(null);

/** Null when feedback is switched off (demo data, print): lists then render without controls. */
export const useFeedback = (): FeedbackApi | null => useContext(FeedbackContext);
