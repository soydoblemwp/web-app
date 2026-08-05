import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { authEdgeConfig } from "@/lib/auth/edge-config";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

/**
 * Thrown from authorize() — and ONLY from there — once the password has
 * already been proven correct for an account whose email isn't verified
 * yet. Auth.js's own documented mechanism (a CredentialsSignin subclass
 * with a `code`) for surfacing a specific, non-generic reason instead of
 * the default "invalid credentials": src/server/actions/login.ts catches
 * this by its `code` and shows a distinct message. `code` becomes part of
 * the error surface (query param on a redirect-based flow), so it must
 * never say more than "email_not_verified" — no email, no user id, nothing
 * that could help enumerate accounts by itself.
 */
class EmailNotVerifiedSignInError extends CredentialsSignin {
  code = "email_not_verified";
}

/**
 * Full Auth.js config: extends the edge-safe base with the Prisma adapter
 * and the Credentials provider. Only import this from Node-runtime code
 * (server components, route handlers, server actions) — never from
 * `middleware.ts`. See `edge-config.ts` for why.
 */
export const authConfig: NextAuthConfig = {
  ...authEdgeConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        if (user.isSuspended) return null;

        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        // Only ever reached once the password has already been proven
        // correct — never checked earlier, so a wrong-password attempt
        // against an unverified account is indistinguishable from one
        // against any other account (both simply return null above).
        if (!user.emailVerified) throw new EmailNotVerifiedSignInError();

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          role: user.role,
          emailVerified: user.emailVerified,
        };
      },
    }),
  ],
};
