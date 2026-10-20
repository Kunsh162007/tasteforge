"use client";

import { useEffect, useId, useRef } from "react";
import type { Evidence } from "@/ui/contract";

type Props = {
  ids: readonly string[];
  title: string;
  evidence: Readonly<Record<string, Evidence>>;
  onClose: () => void;
};

const pct = (n: number) => `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`;

function Meter({ name, value }: { name: string; value?: number }) {
  return (
    <li className="ev-row">
      <span className="ev-row__name">{name}</span>
      {value === undefined ? null : (
        <>
          <span className="ev-row__bar" aria-hidden="true">
            <span style={{ width: pct(value) }} />
          </span>
          <span className="ev-row__val">{value.toFixed(2)}</span>
        </>
      )}
    </li>
  );
}

function EvidenceCard({ record }: { record: Evidence }) {
  const params = Object.entries(record.params);
  return (
    <article className="ev-card" aria-label={`Evidence ${record.id}`}>
      <header className="ev-card__head">
        <span className="ev-card__id">{record.id}</span>
        <code className="ev-card__endpoint">{record.endpoint}</code>
      </header>
      {record.summary ? <p className="ev-card__summary">{record.summary}</p> : null}
      {params.length > 0 ? (
        <dl className="ev-params">
          {params.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {record.entities?.length ? (
        <>
          <h4 className="ev-card__sub">Entities (affinity)</h4>
          <ul className="ev-list">
            {record.entities.map((e) => (
              <Meter key={e.id} name={e.name} value={e.affinity} />
            ))}
          </ul>
        </>
      ) : null}
      {record.tags?.length ? (
        <>
          <h4 className="ev-card__sub">Tags (score)</h4>
          <ul className="ev-list">
            {record.tags.map((t) => (
              <Meter key={t.id} name={t.name} value={t.score} />
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}

export function EvidenceDrawer({ ids, title, evidence, onClose }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="drawer-root">
      <div className="drawer-scrim" onClick={onClose} aria-hidden="true" />
      <div ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="drawer__head">
          <div>
            <p className="drawer__kicker">Evidence from Qloo</p>
            <h2 id={titleId} className="drawer__title">
              {title}
            </h2>
          </div>
          <button ref={closeRef} type="button" className="btn-quiet" onClick={onClose}>
            Close
          </button>
        </header>
        <div className="drawer__body">
          {ids.map((id) => {
            const record = evidence[id];
            return record ? (
              <EvidenceCard key={id} record={record} />
            ) : (
              <article key={id} className="ev-card ev-card--missing">
                <span className="ev-card__id">{id}</span>
                <p className="ev-card__summary">This evidence record was not included with the brief.</p>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
