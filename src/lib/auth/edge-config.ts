import type { NextAuthConfig } from "next-auth";
import type { GlobalRole } from "@/generated/prisma/enums";

/**
 * Edge-safe subset of the Auth.js config: no adapter, no providers, no
 * Prisma/bcrypt imports. This is the only config `middleware.ts` may import —
 * middleware runs in the Edge runtime, which can't load Node built-ins that
 * the generated Prisma client and bcryptjs depend on. The full config in
 * `config.ts` extends this with the adapter and providers for use in
 * Node-runtime server components, route handlers, and server actions.
 */
export const authEdgeConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: GlobalRole }).role ?? "USER";
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as GlobalRole;
      }
      return session;
    },
  },
};
