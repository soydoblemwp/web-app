"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { evaluateExpression, type AngleMode } from "@/lib/public-tools/math/expression-parser";
import { formatCalculatorResult, CALCULATOR_DISPLAY_PRECISION } from "@/lib/public-tools/math/numeric-format";

const BUTTON_ROWS: { label: string; insert: string }[][] = [
  [
    { label: "sin", insert: "sin(" },
    { label: "cos", insert: "cos(" },
    { label: "tan", insert: "tan(" },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
  ],
  [
    { label: "asin", insert: "asin(" },
    { label: "acos", insert: "acos(" },
    { label: "atan", insert: "atan(" },
    { label: "log", insert: "log10(" },
    { label: "ln", insert: "ln(" },
  ],
  [
    { label: "π", insert: "pi" },
    { label: "e", insert: "e" },
    { label: "√", insert: "sqrt(" },
    { label: "∛", insert: "cbrt(" },
    { label: "xʸ", insert: "^" },
  ],
  [
    { label: "7", insert: "7" },
    { label: "8", insert: "8" },
    { label: "9", insert: "9" },
    { label: "/", insert: "/" },
    { label: "!", insert: "!" },
  ],
  [
    { label: "4", insert: "4" },
    { label: "5", insert: "5" },
    { label: "6", insert: "6" },
    { label: "*", insert: "*" },
    { label: "%", insert: "%" },
  ],
  [
    { label: "1", insert: "1" },
    { label: "2", insert: "2" },
    { label: "3", insert: "3" },
    { label: "-", insert: "-" },
    { label: "abs", insert: "abs(" },
  ],
  [
    { label: "0", insert: "0" },
    { label: ".", insert: "." },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
    { label: "+", insert: "+" },
  ],
];

interface HistoryEntry {
  expression: string;
  result: string;
}

export function ScientificCalculatorTool() {
  const [expression, setExpression] = useState("");
  const [mode, setMode] = useState<AngleMode>("deg");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memory, setMemory] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function insertAtCursor(text: string) {
    const el = inputRef.current;
    if (!el) {
      setExpression((prev) => prev + text);
      return;
    }
    const start = el.selectionStart ?? expression.length;
    const end = el.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + text + expression.slice(end);
    setExpression(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + text.length, start + text.length);
    });
  }

  function handleEvaluate() {
    setError(null);
    const evaluated = evaluateExpression(expression, mode);
    if (!evaluated.ok) {
      setError(evaluated.error ?? "Expresión inválida.");
      setResult(null);
      return;
    }
    const formatted = formatCalculatorResult(evaluated.value!);
    setResult(formatted);
    setHistory((prev) => [...prev, { expression, result: formatted }]);
  }

  function handleMemory(op: "M+" | "M-" | "MR" | "MC") {
    if (op === "MC") {
      setMemory(0);
      return;
    }
    if (op === "MR") {
      insertAtCursor(String(memory));
      return;
    }
    const evaluated = evaluateExpression(expression || result || "0", mode);
    if (!evaluated.ok) return;
    setMemory((prev) => (op === "M+" ? prev + evaluated.value! : prev - evaluated.value!));
  }

  function handleReset() {
    setExpression("");
    setResult(null);
    setError(null);
    setHistory([]);
  }

  const historyText = history.map((h) => `${h.expression} = ${h.result}`).join("\n");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          <Button type="button" size="sm" variant={mode === "deg" ? "default" : "outline"} onClick={() => setMode("deg")}>
            Grados
          </Button>
          <Button type="button" size="sm" variant={mode === "rad" ? "default" : "outline"} onClick={() => setMode("rad")}>
            Radianes
          </Button>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={() => handleMemory("M+")}>
            M+
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => handleMemory("M-")}>
            M-
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => handleMemory("MR")}>
            MR
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => handleMemory("MC")}>
            MC
          </Button>
        </div>
      </div>

      <div>
        <label htmlFor="calc-expression" className="sr-only">
          Expresión matemática
        </label>
        <textarea
          ref={inputRef}
          id="calc-expression"
          value={expression}
          onChange={(e) => setExpression(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleEvaluate();
            }
          }}
          rows={2}
          className="w-full rounded-md border p-3 font-mono text-lg"
          placeholder="Escribe una expresión, p. ej. sin(30) + sqrt(16)"
          aria-describedby="calc-result"
        />
      </div>

      <div id="calc-result" aria-live="polite" className="rounded-lg border bg-muted/30 p-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-2xl font-semibold">{result ?? "0"}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          Precisión mostrada: {CALCULATOR_DISPLAY_PRECISION} cifras significativas. Memoria: {memory}
        </p>
      </div>

      <div className="grid grid-cols-5 gap-2">
        {BUTTON_ROWS.flat().map((btn, i) => (
          <Button key={`${btn.label}-${i}`} type="button" variant="outline" size="sm" onClick={() => insertAtCursor(btn.insert)}>
            {btn.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={handleEvaluate}>
          Calcular (Enter)
        </Button>
        <CopyButton text={result ?? ""} label="Copiar resultado" />
        <DownloadButton content={historyText} filename="historial-calculadora.txt" label="Descargar historial" />
        <ResetButton onReset={handleReset} />
      </div>

      {history.length > 0 ? (
        <div>
          <h2 className="text-sm font-semibold">Historial de esta sesión</h2>
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {history
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i} className="font-mono">
                  {h.expression} = {h.result}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
