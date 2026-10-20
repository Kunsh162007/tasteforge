"use client";

import { useId, useState, type FormEvent } from "react";
import type { BriefMode, BriefRequestBody } from "@/ui/contract";

type Example = { label: string; prompt: string; mode: BriefMode; city?: string };

export const EXAMPLES: readonly Example[] = [
  { label: "A café in Indore", prompt: "I'm opening a café in Indore and want to know who to design it for.", mode: "find_audience", city: "Indore" },
  { label: "A ceramic artist", prompt: "I'm a ceramic artist selling handmade tableware and need to find my audience.", mode: "find_audience" },
  {
    label: "A couple, A24, Radiohead, pho",
    prompt: "A couple who love A24 films, Radiohead and Vietnamese food.",
    mode: "know_audience",
    city: "Brooklyn",
  },
];

const MODES: readonly { value: BriefMode; label: string; hint: string }[] = [
  { value: "know_audience", label: "I know my audience", hint: "Describe who they are and what they love." },
  { value: "find_audience", label: "Find my audience", hint: "Describe what you make. We work out who loves it." },
];

type Props = {
  busy: boolean;
  onSubmit: (body: BriefRequestBody) => void;
};

/** The secondary path: describe your own project. The showcase above is the instant one. */
export function Compose({ busy, onSubmit }: Props) {
  const [mode, setMode] = useState<BriefMode>("know_audience");
  const [prompt, setPrompt] = useState("");
  const [city, setCity] = useState("");
  const ids = { prompt: useId(), city: useId(), hint: useId() };
  const hint = MODES.find((m) => m.value === mode)?.hint;
  const canSubmit = prompt.trim().length >= 3 && !busy;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const trimmedCity = city.trim();
    onSubmit({ prompt: prompt.trim(), mode, ...(trimmedCity ? { city: trimmedCity } : {}) });
  };

  const applyExample = (ex: Example) => {
    setMode(ex.mode);
    setPrompt(ex.prompt);
    setCity(ex.city ?? "");
  };

  return (
    <form className="compose" onSubmit={submit} aria-labelledby="compose-h">
      <h2 id="compose-h" className="section-title compose__title">
        Or brief your own project
      </h2>
      <fieldset className="modes">
        <legend className="sr-only">How would you like to start</legend>
        {MODES.map((m) => (
          <label key={m.value} className="mode" data-active={mode === m.value}>
            <input type="radio" name="mode" value={m.value} checked={mode === m.value} onChange={() => setMode(m.value)} />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>

      <div className="field">
        <label htmlFor={ids.prompt} className="field__label">
          Tell us about the project
        </label>
        <p id={ids.hint} className="field__hint">
          {hint}
        </p>
        <textarea
          id={ids.prompt}
          className="field__input field__input--area"
          rows={4}
          maxLength={1000}
          value={prompt}
          aria-describedby={ids.hint}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A neighbourhood bakery that plays jazz on vinyl..."
        />
      </div>

      <div className="field field--city">
        <label htmlFor={ids.city} className="field__label">
          City <span className="field__opt">optional</span>
        </label>
        <input
          id={ids.city}
          className="field__input"
          type="text"
          maxLength={80}
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Indore"
          autoComplete="off"
        />
      </div>

      <div className="compose__actions">
        <button type="submit" className="btn-primary" disabled={!canSubmit}>
          Build the brief
        </button>
        <p className="compose__time">Takes 20 to 60 seconds. You can watch every question we ask Qloo.</p>
      </div>
      <div className="examples">
        <p className="examples__label">Or start from an example</p>
        <ul>
          {EXAMPLES.map((ex) => (
            <li key={ex.label}>
              <button type="button" className="example" onClick={() => applyExample(ex)}>
                {ex.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </form>
  );
}
