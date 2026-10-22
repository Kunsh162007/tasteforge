"use client";

import { useId, useState, type FormEvent } from "react";
import { isSameCity, suggestSecondCity } from "@/ui/compareCity";

/** "Compare with another city" action under a finished brief. */
export function CompareBar({ city, onCompare }: { city: string; onCompare: (city: string) => void }) {
  const [open, setOpen] = useState(false);
  const suggestion = suggestSecondCity(city);
  const [value, setValue] = useState(suggestion);
  const id = useId();
  const other = value.trim();
  const same = isSameCity(other, city);
  const canSubmit = other.length >= 2 && !same;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) onCompare(other);
  };

  if (!open) {
    return (
      <section className="compare-bar" aria-label="Compare cities">
        <p>
          <strong>Same audience, different city?</strong> See how {city} compares with {suggestion}.
        </p>
        <button type="button" className="btn-primary" onClick={() => setOpen(true)}>
          Compare with another city
        </button>
      </section>
    );
  }
  return (
    <form className="compare-bar" onSubmit={submit} aria-label="Compare cities">
      <label htmlFor={id} className="field__label">
        Second city
      </label>
      <div className="compare-bar__row">
        <input
          id={id}
          className="field__input"
          type="text"
          maxLength={80}
          autoComplete="off"
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={suggestion}
          aria-describedby={`${id}-hint`}
        />
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          Compare
        </button>
        <button type="button" className="link-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <p id={`${id}-hint`} className="field__hint">
        {same ? "Pick a different city from the brief." : `Same prompt and seeds as the ${city} brief, so it costs one language-model call.`}
      </p>
    </form>
  );
}
