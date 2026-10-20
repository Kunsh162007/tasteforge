"use client";

import type { SlotPath } from "@/lib/agent/briefItems";
import type { Item } from "@/ui/contract";
import { useFeedback } from "./FeedbackContext";

/** Like, dislike and lock controls for one brief item. Each is a toggle button with a clear pressed state. */
export function ItemFeedback({ path, item }: { path: SlotPath; item: Item }) {
  const feedback = useFeedback();
  if (!feedback) return null;
  const { mark, locked } = feedback.stateOf(path, item);
  return (
    <div className="fb" role="group" aria-label={`Feedback for ${item.label}`}>
      <button
        type="button"
        className="fb__btn"
        data-kind="like"
        aria-pressed={mark === "liked"}
        aria-label={`Like ${item.label}`}
        title="Like: keep it and find more like it"
        onClick={() => feedback.toggleMark(path, item, "liked")}
      >
        <span aria-hidden="true">👍</span>
      </button>
      <button
        type="button"
        className="fb__btn"
        data-kind="dislike"
        aria-pressed={mark === "disliked"}
        aria-label={`Dislike ${item.label}`}
        title="Dislike: replace it"
        onClick={() => feedback.toggleMark(path, item, "disliked")}
      >
        <span aria-hidden="true">👎</span>
      </button>
      <button
        type="button"
        className="fb__btn"
        data-kind="lock"
        aria-pressed={locked}
        aria-label={`Lock ${item.label}`}
        title="Lock: keep it exactly as it is"
        onClick={() => feedback.toggleLock(path, item)}
      >
        <span aria-hidden="true">🔒</span>
      </button>
    </div>
  );
}
