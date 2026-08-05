"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton, ResetButton } from "@/components/public-tools/copy-download-actions";
import { UNIT_CATEGORIES, convertUnit, formatUnitValue, type UnitCategoryId } from "@/lib/public-tools/utilities/units";
import { parseNumericInput } from "@/lib/public-tools/utilities/validation";

export function UnitConverterTool() {
  const [categoryId, setCategoryId] = useState<UnitCategoryId>("longitud");
  const category = useMemo(() => UNIT_CATEGORIES.find((c) => c.id === categoryId)!, [categoryId]);
  const [fromUnit, setFromUnit] = useState(category.units[0].id);
  const [toUnit, setToUnit] = useState(category.units[1]?.id ?? category.units[0].id);
  const [rawValue, setRawValue] = useState("1");
  const [precision, setPrecision] = useState(4);
  const [scientific, setScientific] = useState(false);

  function handleCategoryChange(next: UnitCategoryId) {
    setCategoryId(next);
    const nextCategory = UNIT_CATEGORIES.find((c) => c.id === next)!;
    setFromUnit(nextCategory.units[0].id);
    setToUnit(nextCategory.units[1]?.id ?? nextCategory.units[0].id);
  }

  function handleSwap() {
    setFromUnit(toUnit);
    setToUnit(fromUnit);
  }

  const parsed = parseNumericInput(rawValue, "El valor");
  const conversion = parsed.ok ? convertUnit(categoryId, fromUnit, toUnit, parsed.value!) : { ok: false, error: parsed.error };

  const formatted = conversion.ok && conversion.value !== undefined ? formatUnitValue(conversion.value, precision, scientific) : null;

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="unit-category" className="mb-1">
          Categoría
        </Label>
        <Select value={categoryId} onValueChange={(v) => handleCategoryChange(v as UnitCategoryId)}>
          <SelectTrigger id="unit-category" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {UNIT_CATEGORIES.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <Label htmlFor="unit-from" className="mb-1">
            De
          </Label>
          <Select value={fromUnit} onValueChange={(v) => setFromUnit(v as string)}>
            <SelectTrigger id="unit-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {category.units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="sm" className="self-end" onClick={handleSwap} aria-label="Intercambiar unidades">
          ⇄
        </Button>
        <div>
          <Label htmlFor="unit-to" className="mb-1">
            A
          </Label>
          <Select value={toUnit} onValueChange={(v) => setToUnit(v as string)}>
            <SelectTrigger id="unit-to" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {category.units.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="unit-value" className="mb-1">
            Valor
          </Label>
          <Input id="unit-value" value={rawValue} onChange={(e) => setRawValue(e.target.value)} inputMode="decimal" />
        </div>
        <div>
          <Label htmlFor="unit-precision" className="mb-1">
            Precisión (decimales)
          </Label>
          <Input id="unit-precision" type="number" min={0} max={15} value={precision} onChange={(e) => setPrecision(Number(e.target.value))} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <Checkbox checked={scientific} onCheckedChange={(c) => setScientific(Boolean(c))} />
          Notación científica
        </label>
      </div>

      {!conversion.ok ? (
        <p role="alert" className="text-sm text-destructive">
          {conversion.error}
        </p>
      ) : (
        <div aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm">
          <p className="flex items-center gap-2 text-base font-medium">
            <code>{formatted}</code> {category.units.find((u) => u.id === toUnit)?.label}
            <CopyButton text={formatted ?? ""} label="Copiar" />
          </p>
          {conversion.formula ? <p className="text-muted-foreground">Fórmula: {conversion.formula}</p> : null}
        </div>
      )}

      <ResetButton
        onReset={() => {
          setRawValue("1");
          setPrecision(4);
          setScientific(false);
        }}
      />
    </div>
  );
}
