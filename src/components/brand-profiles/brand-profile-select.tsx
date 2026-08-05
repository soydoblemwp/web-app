"use client";

import { useEffect, useState } from "react";
import { listBrandProfilesForSelectAction } from "@/server/actions/brand-profiles";
import { buildBrandProfileContext } from "@/lib/brand-profiles/context";
import type { BrandProfileLike } from "@/lib/brand-profiles/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

const AUTO_VALUE = "__auto__";
const NONE_VALUE = "__none__";

/**
 * "Seleccionar Brand Kit" — the control AiGenerationForm renders for every
 * AI Center tool. Fetches the user's Brand Kits client-side on mount (so no
 * change is needed to any of the ~11 tool page.tsx files) and resolves to
 * the default profile's context automatically, exactly like the spec asks:
 * "Si no se selecciona ninguno: usar automáticamente el Brand Kit por
 * defecto." Renders nothing when the user has no Brand Kit yet.
 */
export function BrandProfileSelect({
  projectId,
  onContextChange,
  onProfileChange,
  initialProfileId,
}: {
  projectId: string;
  onContextChange: (context: string) => void;
  /** Optional — lets a caller (e.g. the editor sidebar's "Resumen" tab) persist WHICH profile was used, not just its rendered context text. */
  onProfileChange?: (profile: BrandProfileLike | null) => void;
  /** Optional — pre-selects a specific profile (e.g. one already saved on a ContentItem) instead of defaulting to "Automático". */
  initialProfileId?: string | null;
}) {
  const [profiles, setProfiles] = useState<BrandProfileLike[]>([]);
  const [selected, setSelected] = useState<string>(initialProfileId ?? AUTO_VALUE);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBrandProfilesForSelectAction(projectId).then((result) => {
      if (cancelled) return;
      setProfiles(result);
      setLoaded(true);
      const preselected = initialProfileId ? result.find((profile) => profile.id === initialProfileId) : undefined;
      if (preselected) {
        onContextChange(buildBrandProfileContext(preselected));
        onProfileChange?.(preselected);
        return;
      }
      const defaultProfile = result.find((profile) => profile.isDefault);
      if (defaultProfile) {
        onContextChange(buildBrandProfileContext(defaultProfile));
        onProfileChange?.(defaultProfile);
      }
    });
    return () => {
      cancelled = true;
    };
    // Only re-fetch if the project itself changes — onContextChange/onProfileChange are stable setters from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function handleChange(value: string | null) {
    if (!value) return;
    setSelected(value);

    if (value === NONE_VALUE) {
      onContextChange("");
      onProfileChange?.(null);
      return;
    }
    if (value === AUTO_VALUE) {
      const defaultProfile = profiles.find((profile) => profile.isDefault);
      onContextChange(defaultProfile ? buildBrandProfileContext(defaultProfile) : "");
      onProfileChange?.(defaultProfile ?? null);
      return;
    }
    const profile = profiles.find((p) => p.id === value);
    onContextChange(profile ? buildBrandProfileContext(profile) : "");
    onProfileChange?.(profile ?? null);
  }

  if (!loaded || profiles.length === 0) return null;

  return (
    <div className="space-y-2">
      <Label htmlFor="brand-kit-select">Brand Kit</Label>
      <Select value={selected} onValueChange={handleChange}>
        <SelectTrigger id="brand-kit-select" size="sm" className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={AUTO_VALUE}>Automático (Brand Kit predeterminado)</SelectItem>
          <SelectItem value={NONE_VALUE}>Ninguno</SelectItem>
          {profiles.map((profile) => (
            <SelectItem key={profile.id} value={profile.id}>
              {profile.name}
              {profile.isDefault ? " (predeterminado)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
