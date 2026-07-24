"use client";

import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/**
 * A plain <form> submit button that asks for confirmation first — used for
 * every destructive admin action instead of a modal/menu that could crash.
 * Must be the only child of the <form action={...}> it confirms.
 */
export function ConfirmSubmitButton({
  confirmMessage,
  onClick,
  ...props
}: ComponentProps<typeof Button> & { confirmMessage: string }) {
  return (
    <Button
      type="submit"
      {...props}
      onClick={(event) => {
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
    />
  );
}
