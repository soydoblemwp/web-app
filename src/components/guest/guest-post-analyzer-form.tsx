"use client";

import { useState } from "react";
import { analyzePost, type PostAnalysisResult } from "@/lib/content/post-analyzer";
import { socialPlatformValues } from "@/lib/validation/social";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const STATUS_STYLES: Record<string, string> = {
  pass: "text-emerald-600",
  warning: "text-amber-600",
  fail: "text-destructive",
};

export function GuestPostAnalyzerForm() {
  const [platform, setPlatform] = useState("INSTAGRAM");
  const [result, setResult] = useState<PostAnalysisResult | null>(null);

  return (
    <div className="space-y-6">
      <form
        action={(formData) => {
          const text = String(formData.get("text") ?? "");
          setResult(analyzePost({ text, platform }));
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="platform">Plataforma</Label>
          <Select value={platform} onValueChange={(value) => value && setPlatform(value)}>
            <SelectTrigger id="platform" className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {socialPlatformValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="text">Texto de la publicación</Label>
          <Textarea id="text" name="text" required rows={8} maxLength={5000} />
        </div>
        <Button type="submit">Analizar publicación</Button>
      </form>

      {result ? (
        <div className="space-y-4 rounded-lg border p-4">
          <div>
            <span className="text-3xl font-semibold">{result.score}</span>
            <span className="text-sm text-muted-foreground">/100</span>
            <p className="mt-1 text-xs text-muted-foreground">
              Comprobaciones deterministas calculadas en tu navegador — no son una opinión de IA.
            </p>
          </div>
          <ul className="space-y-2">
            {result.checks.map((c) => (
              <li key={c.id} className="text-sm">
                <p className={STATUS_STYLES[c.status] ?? ""}>
                  <span className="font-medium">{c.label}:</span> {c.message}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
