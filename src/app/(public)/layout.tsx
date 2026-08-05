import { headers } from "next/headers";
import { resolveActivePublicConfig } from "@/server/services/customer-support-config";
import { pickTrustedHostHeader } from "@/lib/customer-support/hostname";
import { PublicCustomerSupportWidgetMount } from "@/components/customer-support/widget/widget-mount";

/**
 * Wraps ONLY the truly public, unauthenticated pages of this app (`/` and
 * `/legal/*` — moved here unchanged, see git history for the plain
 * relocation) with the Customer Support widget (Fase 40 correction). A
 * route GROUP (parens = no URL segment), the same pattern this codebase
 * already uses for (auth)/(dashboard) — never touches the root layout
 * (Header/Toaster/ThemeProvider stay exactly as they were), never touches
 * `/admin`, `/dashboard`, `/api`, `/login`, `/register`, `/verify-email`,
 * or `/guest` (none of those live under this group).
 *
 * The widget mount is a single, isolated sibling of `{children}` — this
 * layout never wraps/modifies the page content itself. Which project's
 * widget (if any) shows here is decided ENTIRELY by the real request
 * hostname (see hostname.ts's `pickTrustedHostHeader` doc comment for which
 * header this deployment trusts) — never by activation order, never by a
 * client-suppliable value.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const requestHeaders = await headers();
  const hostname = pickTrustedHostHeader(requestHeaders.get("x-forwarded-host"), requestHeaders.get("host"));
  const bootstrap = hostname ? await resolveActivePublicConfig(hostname) : null;

  return (
    <>
      {children}
      <PublicCustomerSupportWidgetMount bootstrap={bootstrap} />
    </>
  );
}
