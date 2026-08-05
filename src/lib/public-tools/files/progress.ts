export interface ProgressState {
  step: string;
  current: number;
  total: number;
  cancelled: boolean;
}

export function computePercent(current: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((current / total) * 100));
}

/** Cooperative cancellation token — long loops (rendering many PDF pages, generating many images) check `token.cancelled` between iterations and stop early, since there is no way to truly pre-empt synchronous JS/canvas work. */
export class CancellationToken {
  private _cancelled = false;

  cancel(): void {
    this._cancelled = true;
  }

  get cancelled(): boolean {
    return this._cancelled;
  }

  throwIfCancelled(): void {
    if (this._cancelled) throw new CancelledError();
  }
}

export class CancelledError extends Error {
  constructor() {
    super("La operación fue cancelada.");
    this.name = "CancelledError";
  }
}
