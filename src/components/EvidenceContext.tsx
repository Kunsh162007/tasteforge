"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import type { Evidence } from "@/ui/contract";
import { EvidenceDrawer } from "./EvidenceDrawer";

type OpenFn = (ids: readonly string[], title: string, trigger: HTMLElement | null) => void;
const EvidenceCtx = createContext<OpenFn | null>(null);

export function useOpenEvidence(): OpenFn {
  const open = useContext(EvidenceCtx);
  if (!open) throw new Error("useOpenEvidence must be used inside <EvidenceProvider>");
  return open;
}

/** Like useOpenEvidence, but null outside an <EvidenceProvider> (the proof panel also renders standalone). */
export const useOpenEvidenceIfAvailable = (): OpenFn | null => useContext(EvidenceCtx);

const EvidenceDataCtx = createContext<Readonly<Record<string, Evidence>>>({});

/** The evidence records of the brief on screen (used by the map to read hotspot coordinates). */
export const useEvidenceRecords = (): Readonly<Record<string, Evidence>> => useContext(EvidenceDataCtx);

type DrawerState = { ids: readonly string[]; title: string } | null;

export function EvidenceProvider({
  evidence,
  children,
}: {
  evidence: Readonly<Record<string, Evidence>>;
  children: ReactNode;
}) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const open = useCallback<OpenFn>((ids, title, trigger) => {
    triggerRef.current = trigger;
    setDrawer({ ids, title });
  }, []);

  const close = useCallback(() => {
    setDrawer(null);
    triggerRef.current?.focus();
  }, []);

  const value = useMemo(() => open, [open]);
  return (
    <EvidenceCtx.Provider value={value}>
      <EvidenceDataCtx.Provider value={evidence}>
        {children}
        {drawer ? <EvidenceDrawer ids={drawer.ids} title={drawer.title} evidence={evidence} onClose={close} /> : null}
      </EvidenceDataCtx.Provider>
    </EvidenceCtx.Provider>
  );
}
