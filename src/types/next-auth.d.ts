import type { GlobalRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: GlobalRole;
      /** When the account's email was verified, or null — same field/type Auth.js's own AdapterUser.emailVerified already uses (@auth/prisma-adapter maps it straight from User.emailVerified), reused here rather than a second, differently-typed field. Captured onto the JWT at sign-in (authorize() already refuses to sign in an unverified account, so this is only ever null for a session that predates the email-verification feature itself). Truthy/falsy-checked everywhere it's read (src/lib/permissions/index.ts, src/proxy.ts) — a Date is always truthy, null is always falsy, so no special-casing is needed at any call site. */
      emailVerified: Date | null;
    } & DefaultSession["user"];
  }

  // NOTE: `User.emailVerified` is NOT redeclared here — @auth/core already
  // declares it as `Date | null` (the AdapterUser convention), and
  // redeclaring it with a different type here would conflict via
  // TypeScript's interface-merging rather than extend it.
  interface User {
    role?: GlobalRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: GlobalRole;
    emailVerified?: Date | null;
  }
}
