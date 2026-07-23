import { describe, expect, it } from "vitest";
import { assertSafeExternalUrl, UnsafeUrlError } from "@/lib/security/ssrf-guard";

describe("assertSafeExternalUrl", () => {
  it("rejects loopback IPv4 addresses", async () => {
    await expect(assertSafeExternalUrl("http://127.0.0.1/admin")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects private IPv4 ranges (10.x, 172.16-31.x, 192.168.x)", async () => {
    await expect(assertSafeExternalUrl("http://10.0.0.5/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeExternalUrl("http://172.16.0.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeExternalUrl("http://192.168.1.1/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects the link-local / cloud-metadata address", async () => {
    await expect(assertSafeExternalUrl("http://169.254.169.254/latest/meta-data")).rejects.toBeInstanceOf(
      UnsafeUrlError
    );
  });

  it("rejects IPv6 loopback and unique-local addresses", async () => {
    await expect(assertSafeExternalUrl("http://[::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeExternalUrl("http://[fd00::1]/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects non-http(s) schemes", async () => {
    await expect(assertSafeExternalUrl("ftp://example.com/file")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(assertSafeExternalUrl("file:///etc/passwd")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects URLs with embedded credentials", async () => {
    await expect(assertSafeExternalUrl("http://user:pass@8.8.8.8/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects malformed URLs", async () => {
    await expect(assertSafeExternalUrl("not a url")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("accepts a public IPv4 literal over https", async () => {
    const result = await assertSafeExternalUrl("https://8.8.8.8/");
    expect(result.resolvedIp).toBe("8.8.8.8");
  });
});
