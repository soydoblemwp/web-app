"use client";

import { useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEARCH_DEBOUNCE_MS = 400;

const STATUS_OPTIONS = [
  { value: "ALL", label: "Todos los estados" },
  { value: "DRAFT", label: "Borrador" },
  { value: "PLANNED", label: "Planificada" },
  { value: "ACTIVE", label: "Activa" },
  { value: "PAUSED", label: "Pausada" },
  { value: "COMPLETED", label: "Completada" },
  { value: "ARCHIVED", label: "Archivada" },
];

export function CampaignStudioFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === "ALL") next.delete(key);
    else next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  function updateSearchDebounced(value: string) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => updateParam("search", value), SEARCH_DEBOUNCE_MS);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          defaultValue={searchParams.get("search") ?? ""}
          placeholder="Buscar campañas..."
          className="pl-8"
          onChange={(e) => updateSearchDebounced(e.target.value)}
        />
      </div>
      <Select value={searchParams.get("status") ?? "ALL"} onValueChange={(v) => v && updateParam("status", v)}>
        <SelectTrigger className="w-full sm:w-52">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
