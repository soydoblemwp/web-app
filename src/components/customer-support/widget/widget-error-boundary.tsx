"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  hasError: boolean;
}

/**
 * Isolates the Customer Support widget from the rest of the app (Fase 40
 * spec section 2: "si el widget falla... la pagina debe continuar cargando;
 * el resto de la web no debe mostrar un error"). No error boundary existed
 * anywhere in this codebase before this — React requires a class component
 * for componentDidCatch, function components cannot catch render errors.
 *
 * On error this renders NOTHING (not even a fallback bubble) — a broken
 * widget disappearing entirely is safer than a broken widget trying to keep
 * rendering something, and it can never produce a permanent overlay or
 * layout shift in the rest of the page.
 */
export class CustomerSupportWidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Never throws further, never blocks the rest of the app — logged only for local debugging.
    if (process.env.NODE_ENV !== "production") {
      console.error("[customer-support-widget]", error);
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
