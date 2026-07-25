"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";

const THEME_OPTIONS = [
  { value: "light", label: "Claro", icon: Sun },
  { value: "dark", label: "Oscuro", icon: Moon },
  { value: "system", label: "Sistema", icon: Monitor },
] as const;

const noopSubscribe = () => () => {};

/** True only after the client has hydrated — avoids a server/client mismatch on which button looks active. */
function useHasMounted() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Flat, always-visible 3-way switch — deliberately not a dropdown/popover.
 * A prior DropdownMenu-based header control (see UserMenu) crashed on open,
 * so every header control added since follows this directly-clickable
 * pattern instead.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useHasMounted();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border p-0.5" role="group" aria-label="Tema">
      {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
        <Button
          key={value}
          type="button"
          variant={mounted && theme === value ? "secondary" : "ghost"}
          size="icon-sm"
          aria-label={label}
          aria-pressed={mounted && theme === value}
          onClick={() => setTheme(value)}
        >
          <Icon className="size-3.5" />
        </Button>
      ))}
    </div>
  );
}
