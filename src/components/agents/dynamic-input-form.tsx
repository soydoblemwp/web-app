"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listContentItemsForSelectAction, listCampaignPiecesForSelectAction, listPublicationsForSelectAction, listMediaLibraryForSelectAction } from "@/server/actions/publishing-select";
import { listCampaignsForSelectAction } from "@/server/actions/campaign";
import { listProjectMembersForSelectAction } from "@/server/actions/campaign-team";
import { listOptimizationSessionsForSelectAction } from "@/server/actions/marketing-brain-optimization";
import type { AgentInputFieldSpec } from "@/lib/agents/types";
import { MULTISELECT_VISIBLE_WITHOUT_SEARCH, MULTISELECT_MAX_VISIBLE_RESULTS, MULTISELECT_MAX_SELECTIONS } from "@/lib/agents/governance-limits";

/**
 * The ONE dynamic form renderer every agent's declared input schema drives —
 * never a bespoke form per agent (spec section 6). Resource-reference field
 * types fetch their options through the SAME select actions the rest of the
 * app already uses (Content Item/Campaign/Piece/SocialPost/FileAsset/Member/
 * BrandProfile) — no new picker is invented here.
 */
export function DynamicInputForm({
  projectId,
  fields,
  values,
  onChange,
  brandProfiles,
}: {
  projectId: string;
  fields: AgentInputFieldSpec[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  brandProfiles: { id: string; name: string }[];
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key} className={field.type === "long_text" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
          <Label htmlFor={`field-${field.key}`}>
            {field.label}
            {field.required ? " *" : ""}
          </Label>
          <DynamicField projectId={projectId} field={field} value={values[field.key]} onChange={(v) => onChange(field.key, v)} brandProfiles={brandProfiles} />
          {field.helpText ? <p className="text-xs text-muted-foreground">{field.helpText}</p> : null}
        </div>
      ))}
    </div>
  );
}

function DynamicField({
  projectId,
  field,
  value,
  onChange,
  brandProfiles,
}: {
  projectId: string;
  field: AgentInputFieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
  brandProfiles: { id: string; name: string }[];
}) {
  const id = `field-${field.key}`;

  switch (field.type) {
    case "short_text":
    case "url":
      return <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={field.maxLength} />;
    case "long_text":
      return <Textarea id={id} rows={4} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} maxLength={field.maxLength} />;
    case "number":
      return <Input id={id} type="number" value={(value as number) ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)} />;
    case "date":
      return <Input id={id} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "boolean":
      return (
        <div className="flex items-center gap-1.5 pt-1.5">
          <Checkbox id={id} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />
        </div>
      );
    case "select":
      return (
        <Select value={(value as string) ?? ""} onValueChange={(v) => v && onChange(v)}>
          <SelectTrigger id={id} className="w-full" size="sm">
            <SelectValue placeholder="Selecciona..." />
          </SelectTrigger>
          <SelectContent>
            {(field.options ?? []).map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "multiselect":
      return <MultiSelectField field={field} value={(value as string[]) ?? []} onChange={onChange} />;
    case "brand_profile":
      return (
        <Select value={(value as string) ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
          <SelectTrigger id={id} className="w-full" size="sm">
            <SelectValue placeholder="Selecciona..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Ninguno</SelectItem>
            {brandProfiles.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "content_item":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listContentItemsForSelectAction(projectId)} labelKey="title" />;
    case "campaign":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listCampaignsForSelectAction(projectId)} labelKey="name" />;
    case "campaign_piece":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listCampaignPiecesForSelectAction(projectId)} labelKey="title" />;
    case "social_post":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listPublicationsForSelectAction(projectId)} labelKey="internalTitle" />;
    case "file_asset":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listMediaLibraryForSelectAction(projectId)} labelKey="displayName" />;
    case "project_member":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listProjectMembersForSelectAction(projectId)} labelKey="name" />;
    case "marketing_brain_session":
      return <ResourceSelectField id={id} value={value as string | undefined} onChange={onChange} fetcher={() => listOptimizationSessionsForSelectAction(projectId)} labelKey="label" />;
    default:
      return <Input id={id} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

/**
 * Scalable, accessible multiselect (Fase 37 spec section 22 — fixes the
 * Fase-36 limitation of rendering up to 56 checkboxes with no search or
 * pagination). Reusable for every agent's multiselect field, not a
 * one-off widget for Performance Strategist's metric catalog: search/filter,
 * selected + results counters, a windowed/"cargar más" render instead of an
 * unbounded list, clear-search, clear-selection, "select/remove visible",
 * keyboard navigation (Up/Down/Home/End), accessible labels, disabled state,
 * error display, and an aria-live region for selection-count changes — no
 * virtualization dependency, just a plain sliced render.
 */
function MultiSelectField({
  field,
  value,
  onChange,
  disabled,
  error,
}: {
  field: AgentInputFieldSpec;
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
  error?: string;
}) {
  const allOptions = useMemo(() => field.options ?? [], [field.options]);
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(MULTISELECT_VISIBLE_WITHOUT_SEARCH);
  const [rawActiveIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const inputId = `field-${field.key}-search`;
  const listId = `field-${field.key}-listbox`;
  const errorId = `field-${field.key}-error`;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allOptions;
    return allOptions.filter((opt) => opt.label.toLowerCase().includes(q) || opt.value.toLowerCase().includes(q));
  }, [allOptions, query]);

  const cap = query.trim() ? MULTISELECT_MAX_VISIBLE_RESULTS : Math.max(visibleCount, MULTISELECT_VISIBLE_WITHOUT_SEARCH);
  const visible = filtered.slice(0, cap);
  const hasMore = filtered.length > visible.length;
  const atMaxSelections = value.length >= MULTISELECT_MAX_SELECTIONS;
  // Clamped during render instead of via a setState-in-effect — visible.length can shrink (search
  // narrows results) without a stale activeIndex ever pointing past the end of the rendered list.
  const activeIndex = Math.min(rawActiveIndex, Math.max(0, visible.length - 1));

  function toggle(optValue: string) {
    if (disabled) return;
    const checked = value.includes(optValue);
    if (checked) {
      onChange(value.filter((v) => v !== optValue));
    } else if (!atMaxSelections) {
      onChange([...value, optValue]);
    }
  }

  function selectVisible() {
    const room = MULTISELECT_MAX_SELECTIONS - value.length;
    if (room <= 0) return;
    const toAdd = visible.filter((o) => !value.includes(o.value)).slice(0, room).map((o) => o.value);
    if (toAdd.length > 0) onChange([...value, ...toAdd]);
  }
  function removeVisible() {
    const visibleValues = new Set(visible.map((o) => o.value));
    onChange(value.filter((v) => !visibleValues.has(v)));
  }
  function clearSelection() {
    onChange([]);
  }
  function clearSearch() {
    setQuery("");
    setVisibleCount(MULTISELECT_VISIBLE_WITHOUT_SEARCH);
  }

  function handleListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (visible.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(visible.length - 1);
    } else if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      const opt = visible[activeIndex];
      if (opt) toggle(opt.value);
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div className="space-y-1.5" aria-disabled={disabled}>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Input
            id={inputId}
            role="searchbox"
            aria-label={`Buscar opciones para ${field.label}`}
            aria-controls={listId}
            aria-describedby={error ? errorId : undefined}
            placeholder="Buscar..."
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
          />
        </div>
        {query ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearSearch} disabled={disabled}>
            Limpiar búsqueda
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span aria-live="polite">
          {value.length} de {MULTISELECT_MAX_SELECTIONS} seleccionadas
        </span>
        <span>
          {filtered.length} resultado{filtered.length === 1 ? "" : "s"}
        </span>
        <Button type="button" variant="ghost" size="xs" onClick={selectVisible} disabled={disabled || atMaxSelections || visible.length === 0}>
          Seleccionar visibles
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={removeVisible} disabled={disabled || visible.length === 0}>
          Quitar visibles
        </Button>
        <Button type="button" variant="ghost" size="xs" onClick={clearSelection} disabled={disabled || value.length === 0}>
          Limpiar selección
        </Button>
      </div>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {value.slice(0, 8).map((v) => {
            const opt = allOptions.find((o) => o.value === v);
            return (
              <Badge key={v} variant="secondary">
                {opt?.label ?? v}
              </Badge>
            );
          })}
          {value.length > 8 ? <Badge variant="outline">+{value.length - 8} más</Badge> : null}
        </div>
      ) : null}

      <div
        ref={listRef}
        id={listId}
        role="group"
        aria-label={field.label}
        aria-describedby={error ? errorId : undefined}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={handleListKeyDown}
        className="max-h-56 overflow-y-auto rounded-md border border-input p-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {visible.length === 0 ? (
          <p className="px-1.5 py-2 text-sm text-muted-foreground" aria-live="polite">
            {query ? "No se encontraron opciones para tu búsqueda." : "No hay opciones disponibles."}
          </p>
        ) : (
          <div className="flex flex-col gap-0.5">
            {visible.map((opt, index) => {
              const checked = value.includes(opt.value);
              const optionDisabled = disabled || (!checked && atMaxSelections);
              return (
                <label
                  key={opt.value}
                  data-index={index}
                  className={`flex items-center gap-1.5 rounded px-1.5 py-1 text-sm ${index === activeIndex ? "bg-muted" : ""} ${optionDisabled ? "opacity-50" : "cursor-pointer hover:bg-muted"}`}
                >
                  <Checkbox checked={checked} disabled={optionDisabled} onCheckedChange={() => toggle(opt.value)} aria-label={opt.label} />
                  {opt.label}
                </label>
              );
            })}
          </div>
        )}
        {hasMore ? (
          <div className="pt-1">
            <Button type="button" variant="ghost" size="xs" onClick={() => setVisibleCount((c) => c + MULTISELECT_VISIBLE_WITHOUT_SEARCH)} disabled={disabled}>
              Cargar más ({filtered.length - visible.length} restantes)
            </Button>
          </div>
        ) : null}
      </div>
      {atMaxSelections ? <p className="text-xs text-muted-foreground">Alcanzaste el máximo de {MULTISELECT_MAX_SELECTIONS} selecciones.</p> : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function ResourceSelectField<T extends Record<string, unknown>>({
  id,
  value,
  onChange,
  fetcher,
  labelKey,
}: {
  id: string;
  value: string | undefined;
  onChange: (value: string | null) => void;
  fetcher: () => Promise<T[]>;
  labelKey: string;
}) {
  const [options, setOptions] = useState<T[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcher().then((items) => {
      if (!cancelled) setOptions(items);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Select value={value ?? "__none__"} onValueChange={(v) => onChange(v === "__none__" ? null : v)}>
      <SelectTrigger id={id} className="w-full" size="sm">
        <SelectValue placeholder={options === null ? "Cargando..." : "Selecciona..."} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Ninguno</SelectItem>
        {(options ?? []).map((item) => (
          <SelectItem key={item.id as string} value={item.id as string}>
            {(item[labelKey] as string) || (item.id as string)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
