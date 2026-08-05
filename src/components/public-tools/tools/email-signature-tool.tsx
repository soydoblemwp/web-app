"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, DownloadButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import {
  buildSignatureHtml,
  SOCIAL_PLATFORMS,
  type SignatureFields,
  type SignatureStyle,
  type SignatureTemplate,
  type SignatureVisibility,
} from "@/lib/public-tools/business/email-signature";

const EMPTY_FIELDS: SignatureFields = {
  name: "",
  jobTitle: "",
  company: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  legalText: "",
  pronouns: "",
  logoUrl: "",
  photoUrl: "",
  socialLinks: [{ platform: "LinkedIn", url: "" }],
};

const DEFAULT_VISIBILITY: SignatureVisibility = {
  jobTitle: true,
  company: true,
  phone: true,
  email: true,
  website: true,
  address: false,
  legalText: false,
  pronouns: false,
  logo: false,
  photo: false,
  social: true,
};

const TEMPLATE_LABELS: Record<SignatureTemplate, string> = {
  minimal: "Minimalista",
  professional: "Profesional",
  compact: "Compacta",
  corporate: "Corporativa",
  creative: "Creativa",
};

export function EmailSignatureTool() {
  const [fields, setFields] = useState<SignatureFields>(EMPTY_FIELDS);
  const [style, setStyle] = useState<SignatureStyle>({
    template: "professional",
    primaryColor: "#1a73e8",
    secondaryColor: "#5f6368",
    fontSize: 13,
    spacing: 6,
    showIcons: true,
    showDividers: true,
    visibility: DEFAULT_VISIBILITY,
  });

  function updateField<K extends keyof SignatureFields>(key: K, value: SignatureFields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }
  function updateVisibility(key: keyof SignatureVisibility, value: boolean) {
    setStyle((prev) => ({ ...prev, visibility: { ...prev.visibility, [key]: value } }));
  }
  function updateSocial(index: number, field: "platform" | "url", value: string) {
    setFields((prev) => ({ ...prev, socialLinks: prev.socialLinks.map((s, i) => (i === index ? { ...s, [field]: value } : s)) }));
  }
  function addSocial() {
    setFields((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, { platform: "X", url: "" }] }));
  }
  function removeSocial(index: number) {
    setFields((prev) => ({ ...prev, socialLinks: prev.socialLinks.filter((_, i) => i !== index) }));
  }

  const built = useMemo(() => buildSignatureHtml(fields, style), [fields, style]);

  function handleReset() {
    setFields(EMPTY_FIELDS);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Input aria-label="Nombre" placeholder="Nombre" value={fields.name} onChange={(e) => updateField("name", e.target.value)} />
          <Input aria-label="Cargo" placeholder="Cargo" value={fields.jobTitle} onChange={(e) => updateField("jobTitle", e.target.value)} />
          <Input aria-label="Empresa" placeholder="Empresa" value={fields.company} onChange={(e) => updateField("company", e.target.value)} />
          <Input aria-label="Teléfono" placeholder="Teléfono" value={fields.phone} onChange={(e) => updateField("phone", e.target.value)} />
          <Input aria-label="Correo" placeholder="Correo" value={fields.email} onChange={(e) => updateField("email", e.target.value)} />
          <Input aria-label="Sitio web" placeholder="Sitio web" value={fields.website} onChange={(e) => updateField("website", e.target.value)} />
          <Input aria-label="Dirección" placeholder="Dirección" value={fields.address} onChange={(e) => updateField("address", e.target.value)} />
          <Input aria-label="Pronombres" placeholder="Pronombres (opcional)" value={fields.pronouns} onChange={(e) => updateField("pronouns", e.target.value)} />
          <Input aria-label="Texto legal" placeholder="Texto legal (opcional)" value={fields.legalText} onChange={(e) => updateField("legalText", e.target.value)} />
          <Input aria-label="URL del logo" placeholder="URL del logo (https://...)" value={fields.logoUrl} onChange={(e) => updateField("logoUrl", e.target.value)} />
          <Input aria-label="URL de la fotografía" placeholder="URL de la fotografía (https://...)" value={fields.photoUrl} onChange={(e) => updateField("photoUrl", e.target.value)} />

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Enlaces sociales</p>
            {fields.socialLinks.map((link, index) => (
              <div key={index} className="flex gap-2">
                <Select value={link.platform} onValueChange={(v) => updateSocial(index, "platform", v as string)}>
                  <SelectTrigger className="w-36" aria-label={`Plataforma ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOCIAL_PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input aria-label={`URL de ${link.platform}`} placeholder="https://..." value={link.url} onChange={(e) => updateSocial(index, "url", e.target.value)} />
                <Button type="button" variant="ghost" size="sm" onClick={() => removeSocial(index)}>
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addSocial}>
              Añadir enlace
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <Label htmlFor="sig-template" className="mb-1">
              Plantilla
            </Label>
            <Select value={style.template} onValueChange={(v) => setStyle((prev) => ({ ...prev, template: v as SignatureTemplate }))}>
              <SelectTrigger id="sig-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TEMPLATE_LABELS) as SignatureTemplate[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TEMPLATE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="sig-primary" className="mb-1">
                Color principal
              </Label>
              <input id="sig-primary" type="color" className="h-9 w-full rounded border" value={style.primaryColor} onChange={(e) => setStyle((prev) => ({ ...prev, primaryColor: e.target.value }))} />
            </div>
            <div>
              <Label htmlFor="sig-secondary" className="mb-1">
                Color secundario
              </Label>
              <input id="sig-secondary" type="color" className="h-9 w-full rounded border" value={style.secondaryColor} onChange={(e) => setStyle((prev) => ({ ...prev, secondaryColor: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="sig-fontsize" className="mb-1">
                Tamaño de texto
              </Label>
              <Input id="sig-fontsize" type="number" min={10} max={20} value={style.fontSize} onChange={(e) => setStyle((prev) => ({ ...prev, fontSize: Number(e.target.value) }))} />
            </div>
            <div>
              <Label htmlFor="sig-spacing" className="mb-1">
                Separación
              </Label>
              <Input id="sig-spacing" type="number" min={0} max={16} value={style.spacing} onChange={(e) => setStyle((prev) => ({ ...prev, spacing: Number(e.target.value) }))} />
            </div>
          </div>

          <fieldset className="grid grid-cols-2 gap-1 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Mostrar campos</legend>
            {(Object.keys(DEFAULT_VISIBILITY) as (keyof SignatureVisibility)[]).map((key) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <Checkbox checked={style.visibility[key]} onCheckedChange={(c) => updateVisibility(key, Boolean(c))} />
                {key}
              </label>
            ))}
          </fieldset>
        </div>
      </div>

      {built.warnings.length > 0 ? (
        <ul aria-live="polite" className="list-disc space-y-1 rounded-lg border border-amber-400/40 bg-amber-50 p-3 pl-8 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
          {built.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div>
        <p className="mb-1 text-sm font-medium">Vista previa</p>
        <iframe
          title="Vista previa de la firma de correo"
          sandbox=""
          srcDoc={`<!doctype html><html><body style="margin:0;padding:12px;font-family:Arial,sans-serif;">${built.html}</body></html>`}
          className="h-56 w-full rounded-lg border bg-white"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <CopyButton text={built.plainText} label="Copiar texto plano" />
        <CopyButton text={built.html} label="Copiar HTML" />
        <DownloadButton content={built.html} filename="firma.html" mimeType="text/html" label="Descargar .html" />
        <ResetButton onReset={handleReset} />
      </div>

      <p className="text-xs text-muted-foreground">
        La apariencia puede variar entre clientes de correo (Gmail, Outlook, Apple Mail...). Instrucciones: copia el HTML y pégalo en la configuración de firma de tu cliente de correo, o copia el texto formateado directamente desde la vista previa.
      </p>
    </div>
  );
}
