import type { GlobalRole } from "@/generated/prisma/enums";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: GlobalRole;
    } & DefaultSession["user"];
  }

  interface User {
    role?: GlobalRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: GlobalRole;
  }
}
