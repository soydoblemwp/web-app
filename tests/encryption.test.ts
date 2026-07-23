import { describe, expect, it, beforeAll } from "vitest";

describe("encryptSecret / decryptSecret", () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = "test-only-encryption-key-do-not-use-in-prod";
  });

  it("round-trips a plaintext value", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/security/encryption");
    const plaintext = "wp_application_password_example";
    const encrypted = encryptSecret(plaintext);

    expect(encrypted).not.toBe(plaintext);
    expect(encrypted.split(".")).toHaveLength(3);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const { encryptSecret } = await import("@/lib/security/encryption");
    const a = encryptSecret("same-value");
    const b = encryptSecret("same-value");
    expect(a).not.toBe(b);
  });

  it("throws when the payload has been tampered with", async () => {
    const { encryptSecret, decryptSecret } = await import("@/lib/security/encryption");
    const encrypted = encryptSecret("sensitive-token");
    const [iv, tag, data] = encrypted.split(".");
    const tampered = [iv, tag, data.slice(0, -2) + "AA"].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
  });
});
