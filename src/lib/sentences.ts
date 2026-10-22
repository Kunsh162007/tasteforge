/** Small text helpers for turning fragments into sentences. */

const ENDS_SENTENCE = /[.!?]["')\]]?$/;

/** The text as a sentence: trimmed, first letter capitalised, closed with a full stop when it has no end mark. */
export function asSentence(text: string): string {
  const t = text.trim();
  if (t === "") return t;
  const capped = t.charAt(0).toUpperCase() + t.slice(1);
  return ENDS_SENTENCE.test(capped) ? capped : `${capped}.`;
}

/** Joins notes into one run of sentences ("Natural wine. Creative suggestion from Qloo tags: Jazz."). */
export const joinSentences = (...parts: readonly (string | undefined)[]): string =>
  parts
    .map((p) => asSentence(p ?? ""))
    .filter((p) => p !== "")
    .join(" ");

const GLUED_NOTE = /([^.!?:;\s])\s+(Creative suggestion from Qloo tags\b)/;

/** Repairs a note saved before notes were joined as sentences ("Natural Wine Creative suggestion..."). */
export const tidyNote = (text: string): string => asSentence(text.replace(GLUED_NOTE, "$1. $2"));
