"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  SCHEMA_TYPES,
  getSchemaType,
  buildJsonLd,
  validateJsonLdObject,
  validateSchemaFormValues,
  LOCAL_VALIDITY_LABEL,
  type SchemaTypeId,
  type SchemaFormValues,
  type FaqItem,
  type BreadcrumbItem,
} from "@/lib/public-tools/web/schema-ld";

export function SchemaGeneratorTool() {
  const [typeId, setTypeId] = useState<SchemaTypeId>("Organization");
  const [values, setValues] = useState<SchemaFormValues>({});

  const typeDef = getSchemaType(typeId)!;

  function updateText(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }
  function updateList(key: string, raw: string) {
    setValues((prev) => ({ ...prev, [key]: raw.split("\n").map((v) => v.trim()).filter(Boolean) }));
  }
  function handleTypeChange(next: SchemaTypeId) {
    setTypeId(next);
    setValues({});
  }

  function getFaqItems(source: SchemaFormValues): FaqItem[] {
    return (source.faqItems as FaqItem[] | undefined) ?? [];
  }
  function getBreadcrumbItems(source: SchemaFormValues): BreadcrumbItem[] {
    return (source.items as BreadcrumbItem[] | undefined) ?? [];
  }

  const faqItems: FaqItem[] = getFaqItems(values);
  const breadcrumbItems: BreadcrumbItem[] = getBreadcrumbItems(values);

  function updateFaq(index: number, field: keyof FaqItem, value: string) {
    setValues((prev) => ({ ...prev, faqItems: getFaqItems(prev).map((item, i) => (i === index ? { ...item, [field]: value } : item)) }));
  }
  function addFaq() {
    setValues((prev) => ({ ...prev, faqItems: [...getFaqItems(prev), { question: "", answer: "" }] }));
  }
  function removeFaq(index: number) {
    setValues((prev) => ({ ...prev, faqItems: getFaqItems(prev).filter((_, i) => i !== index) }));
  }

  function updateBreadcrumb(index: number, field: keyof BreadcrumbItem, value: string) {
    setValues((prev) => ({ ...prev, items: getBreadcrumbItems(prev).map((item, i) => (i === index ? { ...item, [field]: value } : item)) }));
  }
  function addBreadcrumb() {
    setValues((prev) => ({ ...prev, items: [...getBreadcrumbItems(prev), { name: "", url: "" }] }));
  }
  function removeBreadcrumb(index: number) {
    setValues((prev) => ({ ...prev, items: getBreadcrumbItems(prev).filter((_, i) => i !== index) }));
  }

  const zodErrors = validateSchemaFormValues(typeId, values);
  const jsonLd = buildJsonLd(typeId, values);
  const findings = validateJsonLdObject(typeId, jsonLd);
  const hasErrors = zodErrors.length > 0 || findings.some((f) => f.severity === "ERROR");

  const jsonText = JSON.stringify(jsonLd, null, 2);
  const scriptText = `<script type="application/ld+json">\n${jsonText}\n</script>`;

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="schema-type" className="mb-1">
          Tipo de schema.org
        </Label>
        <Select value={typeId} onValueChange={(v) => handleTypeChange(v as SchemaTypeId)}>
          <SelectTrigger id="schema-type" className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SCHEMA_TYPES.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-xs text-muted-foreground">{typeDef.description}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {typeDef.fields.map((field) => {
          if (field.kind === "faq-list") {
            return (
              <div key={field.key} className="space-y-2 rounded-lg border p-3 sm:col-span-2">
                <p className="text-sm font-medium">{field.label}</p>
                {faqItems.map((item, index) => (
                  <div key={index} className="space-y-1 rounded border p-2">
                    <Input aria-label={`Pregunta ${index + 1}`} placeholder="Pregunta" value={item.question} onChange={(e) => updateFaq(index, "question", e.target.value)} />
                    <Textarea aria-label={`Respuesta ${index + 1}`} placeholder="Respuesta" value={item.answer} onChange={(e) => updateFaq(index, "answer", e.target.value)} rows={2} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeFaq(index)}>
                      Eliminar
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addFaq}>
                  Añadir pregunta
                </Button>
                <p className="text-xs text-muted-foreground">{field.help}</p>
              </div>
            );
          }
          if (field.kind === "breadcrumb-list") {
            return (
              <div key={field.key} className="space-y-2 rounded-lg border p-3 sm:col-span-2">
                <p className="text-sm font-medium">{field.label}</p>
                {breadcrumbItems.map((item, index) => (
                  <div key={index} className="flex gap-2">
                    <Input aria-label={`Nombre ${index + 1}`} placeholder="Nombre" value={item.name} onChange={(e) => updateBreadcrumb(index, "name", e.target.value)} />
                    <Input aria-label={`URL ${index + 1}`} placeholder="https://..." value={item.url} onChange={(e) => updateBreadcrumb(index, "url", e.target.value)} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeBreadcrumb(index)}>
                      ✕
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addBreadcrumb}>
                  Añadir elemento
                </Button>
              </div>
            );
          }
          if (field.kind === "list") {
            return (
              <div key={field.key} className="sm:col-span-2">
                <Label htmlFor={`schema-${field.key}`} className="mb-1">
                  {field.label}
                </Label>
                <Textarea id={`schema-${field.key}`} rows={3} value={(Array.isArray(values[field.key]) ? (values[field.key] as string[]) : []).join("\n")} onChange={(e) => updateList(field.key, e.target.value)} />
              </div>
            );
          }
          if (field.kind === "textarea") {
            return (
              <div key={field.key} className="sm:col-span-2">
                <Label htmlFor={`schema-${field.key}`} className="mb-1">
                  {field.label} {field.required ? "*" : ""}
                </Label>
                <Textarea id={`schema-${field.key}`} rows={2} value={(values[field.key] as string) ?? ""} onChange={(e) => updateText(field.key, e.target.value)} />
              </div>
            );
          }
          return (
            <div key={field.key}>
              <Label htmlFor={`schema-${field.key}`} className="mb-1">
                {field.label} {field.required ? "*" : ""}
              </Label>
              <Input id={`schema-${field.key}`} type={field.kind === "date" ? "date" : "text"} value={(values[field.key] as string) ?? ""} onChange={(e) => updateText(field.key, e.target.value)} />
              {field.help ? <p className="mt-1 text-xs text-muted-foreground">{field.help}</p> : null}
            </div>
          );
        })}
      </div>

      {zodErrors.length > 0 ? (
        <ul aria-live="polite" className="space-y-1 rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
          {zodErrors.map((e, i) => (
            <li key={i}>{e.message}</li>
          ))}
        </ul>
      ) : null}

      {findings.length > 0 ? (
        <ul aria-live="polite" className="space-y-1 rounded-lg border p-3 text-sm">
          {findings.map((f, i) => (
            <li key={i} className={f.severity === "ERROR" ? "text-destructive" : f.severity === "WARNING" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>
              [{f.severity}] {f.field}: {f.message}
            </li>
          ))}
        </ul>
      ) : null}

      {!hasErrors ? <p className="text-sm text-emerald-600 dark:text-emerald-400">✓ {LOCAL_VALIDITY_LABEL}</p> : null}

      <div className="space-y-2">
        <Label htmlFor="schema-output" className="mb-1">
          JSON-LD
        </Label>
        <Textarea id="schema-output" readOnly value={jsonText} rows={12} className="font-mono text-xs" />
        <div className="flex flex-wrap gap-2">
          <CopyButton text={scriptText} label="Copiar script" />
          <CopyButton text={jsonText} label="Copiar JSON" />
          <DownloadButton content={jsonText} filename="schema.json" mimeType="application/json" label="Descargar .json" />
          <DownloadButton content={scriptText} filename="schema.html" mimeType="text/html" label="Descargar .html" />
          <ResetButton onReset={() => setValues({})} />
        </div>
      </div>

      <p className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        El marcado válido puede hacer que una página sea apta para determinadas funciones de búsqueda, pero no garantiza resultados enriquecidos.
      </p>
    </div>
  );
}
