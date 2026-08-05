"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

const DEFAULT_DEBOUNCE_MS = 1200;

/**
 * Debounced autosave — no prior art in this codebase to reuse (see the
 * project-memory reconnaissance: no existing debounce/autosave anywhere), so
 * this is a small, self-contained implementation local to the editor. Call
 * `notifyChange(value)` on every edit; `save` only ever runs once the value
 * has been stable for `debounceMs`, and never runs twice concurrently for
 * the same value.
 */
export function useEditorAutosave(save: (value: string) => Promise<void>, debounceMs = DEFAULT_DEBOUNCE_MS) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);
  const savedValueRef = useRef<string | null>(null);

  // Loop-based rather than recursive: a save already in flight just updates
  // pendingValueRef and returns, and the active loop below picks it up once
  // the current save settles — avoids a self-referential async callback,
  // which the React Compiler can't preserve memoization for.
  const flush = useCallback(
    async (value: string) => {
      pendingValueRef.current = value;
      if (savingRef.current) return;

      savingRef.current = true;
      try {
        while (pendingValueRef.current !== null) {
          const next = pendingValueRef.current;
          pendingValueRef.current = null;
          if (next === savedValueRef.current) continue;

          setStatus("saving");
          try {
            await save(next);
            savedValueRef.current = next;
            setStatus("saved");
          } catch {
            setStatus("error");
          }
        }
      } finally {
        savingRef.current = false;
      }
    },
    [save]
  );

  const notifyChange = useCallback(
    (value: string) => {
      setStatus("pending");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(value), debounceMs);
    },
    [flush, debounceMs]
  );

  /** Marks `value` as already persisted (e.g. the initial value loaded from the server) without triggering a save. */
  const markSaved = useCallback((value: string) => {
    savedValueRef.current = value;
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  return { status, notifyChange, markSaved };
}
