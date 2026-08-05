"use client";

import dynamic from "next/dynamic";
import { CustomerSupportWidgetErrorBoundary } from "@/components/customer-support/widget/widget-error-boundary";
import type { CustomerSupportWidgetProps } from "@/components/customer-support/widget/customer-support-widget";

/**
 * Lazy-loads the widget's client bundle only when this mounts (spec section
 * 2: "carga diferida cuando sea razonable"), never during SSR (`ssr: false`
 * — `ssr:false` is only honored inside a Client Component, hence this thin
 * wrapper around the Server Component layout that renders it), and always
 * inside the error boundary so a widget crash can never propagate into the
 * rest of the page (Header/Sidebar/Footer/main are siblings, untouched).
 *
 * Two thin mount points, ONE underlying widget bundle (never a second
 * widget) — see customer-support-widget.tsx's module doc for the two modes.
 */
const CustomerSupportWidget = dynamic(() => import("@/components/customer-support/widget/customer-support-widget").then((m) => m.CustomerSupportWidget), {
  ssr: false,
  loading: () => null,
});

/** Dashboard mode — mounted in ProjectLayout for an authenticated project member. */
export function CustomerSupportWidgetMount({ projectId }: { projectId: string }) {
  return (
    <CustomerSupportWidgetErrorBoundary>
      <CustomerSupportWidget projectId={projectId} />
    </CustomerSupportWidgetErrorBoundary>
  );
}

/** Public mode — mounted in the (public) route group's layout for an anonymous visitor. `bootstrap` is already resolved server-side and never carries a projectId. */
export function PublicCustomerSupportWidgetMount({ bootstrap }: { bootstrap: NonNullable<CustomerSupportWidgetProps["publicBootstrap"]> | null }) {
  return (
    <CustomerSupportWidgetErrorBoundary>
      <CustomerSupportWidget publicBootstrap={bootstrap} />
    </CustomerSupportWidgetErrorBoundary>
  );
}
