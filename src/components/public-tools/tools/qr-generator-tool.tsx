"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, RotateCcw } from "lucide-react";
import { CopyButton } from "@/components/public-tools/copy-download-actions";
import { buildQrPayload, type QrContentType } from "@/lib/public-tools/qr-content";
import { contrastRatio } from "@/lib/public-tools/color-contrast";

const TYPE_LABELS: { id: QrContentType; label: string }[] = [
  { id: "url", label: "URL" },
  { id: "text", label: "Texto" },
  { id: "email", label: "Correo" },
  { id: "phone", label: "Teléfono" },
  { id: "sms", label: "SMS" },
  { id: "wifi", label: "Wi-Fi" },
];

export function QrGeneratorTool() {
  const [type, setType] = useState<QrContentType>("url");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [wifiEncryption, setWifiEncryption] = useState<"WPA" | "WEP" | "nopass">("WPA");
  const [wifiHidden, setWifiHidden] = useState(false);
  const [size, setSize] = useState(280);
  const [margin, setMargin] = useState(2);
  const [errorLevel, setErrorLevel] = useState<"L" | "M" | "Q" | "H">("M");
  const [darkColor, setDarkColor] = useState("#000000");
  const [lightColor, setLightColor] = useState("#ffffff");
  const [renderError, setRenderError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const contrast = contrastRatio(darkColor, lightColor);
  const lowContrast = contrast !== null && contrast < 2.5;

  function setField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  const buildResult = useMemo(() => {
    const input =
      type === "wifi"
        ? { ssid: fields.ssid ?? "", password: fields.password ?? "", encryption: wifiEncryption, hidden: wifiHidden }
        : fields;
    return buildQrPayload(type, input);
  }, [type, fields, wifiEncryption, wifiHidden]);

  const payload = buildResult.ok ? (buildResult.payload ?? null) : null;
  const error = buildResult.ok ? renderError : (buildResult.error ?? "Contenido no válido.");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !payload) return;
    let cancelled = false;
    setRenderError(null);
    void QRCode.toCanvas(canvas, payload, {
      width: size,
      margin,
      errorCorrectionLevel: errorLevel,
      color: { dark: darkColor, light: lightColor },
    }).catch(() => {
      if (!cancelled) setRenderError("No se pudo generar el código QR con estos datos.");
    });
    return () => {
      cancelled = true;
    };
  }, [payload, size, margin, errorLevel, darkColor, lightColor]);

  function handleReset() {
    setFields({});
    setRenderError(null);
  }

  async function downloadPng() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "codigo-qr.png";
      link.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  async function downloadSvg() {
    if (!payload) return;
    const svg = await QRCode.toString(payload, { type: "svg", margin, errorCorrectionLevel: errorLevel, color: { dark: darkColor, light: lightColor } });
    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "codigo-qr.svg";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div role="group" aria-label="Tipo de contenido" className="flex flex-wrap gap-2">
        {TYPE_LABELS.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant={type === t.id ? "default" : "outline"}
            aria-pressed={type === t.id}
            onClick={() => {
              setType(t.id);
              setFields({});
            }}
          >
            {t.label}
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          {type === "url" ? (
            <div>
              <Label htmlFor="qr-url" className="mb-1">
                URL
              </Label>
              <Input id="qr-url" value={fields.url ?? ""} onChange={(e) => setField("url", e.target.value)} placeholder="https://ejemplo.com" />
            </div>
          ) : null}

          {type === "text" ? (
            <div>
              <Label htmlFor="qr-text" className="mb-1">
                Texto
              </Label>
              <Textarea id="qr-text" value={fields.text ?? ""} onChange={(e) => setField("text", e.target.value)} className="min-h-24" />
            </div>
          ) : null}

          {type === "email" ? (
            <>
              <div>
                <Label htmlFor="qr-email" className="mb-1">
                  Correo electrónico
                </Label>
                <Input id="qr-email" value={fields.email ?? ""} onChange={(e) => setField("email", e.target.value)} placeholder="nombre@ejemplo.com" />
              </div>
              <div>
                <Label htmlFor="qr-subject" className="mb-1">
                  Asunto (opcional)
                </Label>
                <Input id="qr-subject" value={fields.subject ?? ""} onChange={(e) => setField("subject", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="qr-body" className="mb-1">
                  Mensaje (opcional)
                </Label>
                <Textarea id="qr-body" value={fields.body ?? ""} onChange={(e) => setField("body", e.target.value)} className="min-h-20" />
              </div>
            </>
          ) : null}

          {type === "phone" ? (
            <div>
              <Label htmlFor="qr-phone" className="mb-1">
                Teléfono
              </Label>
              <Input id="qr-phone" value={fields.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} placeholder="+34 600 000 000" />
            </div>
          ) : null}

          {type === "sms" ? (
            <>
              <div>
                <Label htmlFor="qr-sms-phone" className="mb-1">
                  Teléfono
                </Label>
                <Input id="qr-sms-phone" value={fields.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} placeholder="+34 600 000 000" />
              </div>
              <div>
                <Label htmlFor="qr-sms-message" className="mb-1">
                  Mensaje (opcional)
                </Label>
                <Textarea id="qr-sms-message" value={fields.message ?? ""} onChange={(e) => setField("message", e.target.value)} className="min-h-20" />
              </div>
            </>
          ) : null}

          {type === "wifi" ? (
            <>
              <div>
                <Label htmlFor="qr-ssid" className="mb-1">
                  Nombre de la red (SSID)
                </Label>
                <Input id="qr-ssid" value={fields.ssid ?? ""} onChange={(e) => setField("ssid", e.target.value)} />
              </div>
              <div>
                <Label htmlFor="qr-wifi-encryption" className="mb-1">
                  Seguridad
                </Label>
                <Select value={wifiEncryption} onValueChange={(v) => setWifiEncryption(v as typeof wifiEncryption)}>
                  <SelectTrigger id="qr-wifi-encryption" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WPA">WPA/WPA2</SelectItem>
                    <SelectItem value="WEP">WEP</SelectItem>
                    <SelectItem value="nopass">Sin contraseña</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {wifiEncryption !== "nopass" ? (
                <div>
                  <Label htmlFor="qr-wifi-password" className="mb-1">
                    Contraseña
                  </Label>
                  <Input id="qr-wifi-password" type="text" value={fields.password ?? ""} onChange={(e) => setField("password", e.target.value)} />
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <Checkbox id="qr-wifi-hidden" checked={wifiHidden} onCheckedChange={() => setWifiHidden((v) => !v)} />
                <Label htmlFor="qr-wifi-hidden" className="text-sm font-normal">
                  Red oculta
                </Label>
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qr-size" className="mb-1">
                Tamaño (px)
              </Label>
              <Input id="qr-size" type="number" min={100} max={1000} value={size} onChange={(e) => setSize(Number(e.target.value) || 280)} />
            </div>
            <div>
              <Label htmlFor="qr-margin" className="mb-1">
                Margen
              </Label>
              <Input id="qr-margin" type="number" min={0} max={10} value={margin} onChange={(e) => setMargin(Number(e.target.value) || 0)} />
            </div>
          </div>

          <div>
            <Label htmlFor="qr-error-level" className="mb-1">
              Corrección de errores
            </Label>
            <Select value={errorLevel} onValueChange={(v) => setErrorLevel(v as typeof errorLevel)}>
              <SelectTrigger id="qr-error-level" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="L">Baja (L)</SelectItem>
                <SelectItem value="M">Media (M)</SelectItem>
                <SelectItem value="Q">Alta (Q)</SelectItem>
                <SelectItem value="H">Máxima (H)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qr-dark-color" className="mb-1">
                Color de los módulos
              </Label>
              <Input id="qr-dark-color" type="color" value={darkColor} onChange={(e) => setDarkColor(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label htmlFor="qr-light-color" className="mb-1">
                Color de fondo
              </Label>
              <Input id="qr-light-color" type="color" value={lightColor} onChange={(e) => setLightColor(e.target.value)} className="h-9" />
            </div>
          </div>
          {lowContrast ? (
            <p role="alert" className="text-xs text-destructive">
              El contraste entre los colores es muy bajo; el código QR podría no ser legible para los lectores.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-center justify-start gap-3 rounded-lg border p-4">
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            <canvas ref={canvasRef} className="max-w-full" role="img" aria-label="Vista previa del código QR generado" />
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={!payload} onClick={downloadPng}>
          <Download className="size-3.5" /> Descargar PNG
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!payload} onClick={downloadSvg}>
          <Download className="size-3.5" /> Descargar SVG
        </Button>
        <CopyButton text={payload ?? ""} label="Copiar contenido" />
        <Button type="button" variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="size-3.5" /> Reiniciar
        </Button>
      </div>
    </div>
  );
}
