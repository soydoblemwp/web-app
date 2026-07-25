"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

/** Wraps next-themes with this app's defaults: class-based, system-aware, no flash on load. */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  );
}
