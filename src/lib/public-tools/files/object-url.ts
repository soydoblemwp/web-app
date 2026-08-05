/**
 * A tiny tracked-registry for Object URLs, so every tool can revoke exactly
 * the URLs it created on reset/unmount without hunting down each `useState`
 * individually (spec section 9: "libera Object URLs" on close/reset).
 */
export class ObjectUrlRegistry {
  private urls = new Set<string>();

  create(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  revoke(url: string | null | undefined): void {
    if (!url) return;
    if (this.urls.delete(url)) URL.revokeObjectURL(url);
  }

  revokeAll(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }

  get size(): number {
    return this.urls.size;
  }
}
