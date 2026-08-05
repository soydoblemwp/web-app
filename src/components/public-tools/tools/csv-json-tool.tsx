"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileUploadZone } from "@/components/public-tools/file-upload-zone";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { convertCsvToJson, convertJsonToCsv, detectDelimiter, type CsvToJsonOptions, type JsonToCsvOptions } from "@/lib/public-tools/development/csv-json";

type Mode = "csv-to-json" | "json-to-csv";

export function CsvJsonTool() {
  const [mode, setMode] = useState<Mode>("csv-to-json");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");
  const [delimiter, setDelimiter] = useState(",");
  const [hasHeaders, setHasHeaders] = useState(true);
  const [trimCells, setTrimCells] = useState(true);
  const [inferTypes, setInferTypes] = useState(false);
  const [jsonShape, setJsonShape] = useState<CsvToJsonOptions["jsonShape"]>("array-of-objects");
  const [flattenObjects, setFlattenObjects] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [summary, setSummary] = useState("");

  function handleFileLoad(files: File[]) {
    const f = files[0];
    if (!f) return;
    f.text().then((text) => {
      setInput(text);
      if (mode === "csv-to-json") setDelimiter(detectDelimiter(text));
    });
  }

  function handleConvert() {
    setErrors([]);
    setWarnings([]);
    setOutput("");
    setSummary("");

    if (mode === "csv-to-json") {
      const result = convertCsvToJson(input, { delimiter, hasHeaders, trimCells, inferTypes, jsonShape, nullForEmpty: false });
      if (!result.ok) {
        setErrors(result.findings.map((f) => f.message));
        return;
      }
      setWarnings(result.findings.map((f) => f.message));
      setOutput(result.json ?? "");
      setSummary(`${result.rowCount} filas, ${result.columnCount} columnas`);
    } else {
      const options: JsonToCsvOptions = { delimiter, flattenObjects, arrayJoinStrategy: "json" };
      const result = convertJsonToCsv(input, options);
      if (!result.ok) {
        setErrors(result.findings.map((f) => f.message));
        return;
      }
      setWarnings(result.findings.map((f) => f.message));
      setOutput(result.csv ?? "");
      setSummary(`${result.rowCount} filas, ${result.columnCount} columnas`);
    }
  }

  function handleReset() {
    setInput("");
    setOutput("");
    setErrors([]);
    setWarnings([]);
    setSummary("");
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "csv-to-json" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setMode("csv-to-json");
            setOutput("");
          }}
        >
          CSV → JSON
        </Button>
        <Button
          type="button"
          variant={mode === "json-to-csv" ? "default" : "outline"}
          size="sm"
          onClick={() => {
            setMode("json-to-csv");
            setOutput("");
          }}
        >
          JSON → CSV
        </Button>
      </div>

      <div>
        <Label htmlFor="csvjson-input" className="mb-1">
          {mode === "csv-to-json" ? "CSV" : "JSON"} de entrada
        </Label>
        <Textarea id="csvjson-input" value={input} onChange={(e) => setInput(e.target.value)} rows={8} className="font-mono text-sm" />
        <div className="mt-2">
          <FileUploadZone accept={mode === "csv-to-json" ? ".csv,text/csv" : ".json,application/json"} onFilesSelected={handleFileLoad} label="Arrastra un archivo aquí, o" hint="Se procesa localmente." />
        </div>
      </div>

      {mode === "csv-to-json" ? (
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="csv-delimiter" className="mb-1">
              Delimitador
            </Label>
            <Select value={delimiter} onValueChange={(v) => setDelimiter(v as string)}>
              <SelectTrigger id="csv-delimiter" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=",">Coma (,)</SelectItem>
                <SelectItem value=";">Punto y coma (;)</SelectItem>
                <SelectItem value={"\t"}>Tabulación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="json-shape" className="mb-1">
              Forma del JSON
            </Label>
            <Select value={jsonShape} onValueChange={(v) => setJsonShape(v as CsvToJsonOptions["jsonShape"])}>
              <SelectTrigger id="json-shape" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="array-of-objects">Array de objetos</SelectItem>
                <SelectItem value="array-of-arrays">Array de arrays</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={hasHeaders} onCheckedChange={(c) => setHasHeaders(Boolean(c))} />
            Primera fila son encabezados
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={trimCells} onCheckedChange={(c) => setTrimCells(Boolean(c))} />
            Recortar espacios
          </label>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={inferTypes} onCheckedChange={(c) => setInferTypes(Boolean(c))} />
            Inferir tipos (números/booleanos)
          </label>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="csv-out-delimiter" className="mb-1">
              Delimitador de salida
            </Label>
            <Select value={delimiter} onValueChange={(v) => setDelimiter(v as string)}>
              <SelectTrigger id="csv-out-delimiter" className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value=",">Coma (,)</SelectItem>
                <SelectItem value=";">Punto y coma (;)</SelectItem>
                <SelectItem value={"\t"}>Tabulación</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm">
            <Checkbox checked={flattenObjects} onCheckedChange={(c) => setFlattenObjects(Boolean(c))} />
            Aplanar objetos anidados
          </label>
        </div>
      )}

      <Button type="button" onClick={handleConvert}>
        Convertir
      </Button>

      {errors.length > 0 ? (
        <ul role="alert" className="space-y-1 text-sm text-destructive">
          {errors.map((e, i) => (
            <li key={i}>{e}</li>
          ))}
        </ul>
      ) : null}
      {warnings.length > 0 ? (
        <ul aria-live="polite" className="space-y-1 text-sm text-amber-600 dark:text-amber-400">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      ) : null}

      {output ? (
        <div aria-live="polite" className="space-y-2">
          <p className="text-sm text-muted-foreground">{summary}</p>
          <Label htmlFor="csvjson-output" className="mb-1">
            Resultado
          </Label>
          <Textarea id="csvjson-output" readOnly value={output} rows={8} className="font-mono text-sm" />
          <div className="flex flex-wrap gap-2">
            <CopyButton text={output} label="Copiar" />
            <DownloadButton content={output} filename={mode === "csv-to-json" ? "datos.json" : "datos.csv"} mimeType={mode === "csv-to-json" ? "application/json" : "text/csv"} label="Descargar" />
          </div>
        </div>
      ) : null}

      <ResetButton onReset={handleReset} />
    </div>
  );
}
