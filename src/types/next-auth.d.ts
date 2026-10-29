// src/types/next-auth.d.ts
import type { DefaultSession, DefaultUser } from "next-auth";

declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role?: string;
    };
  }

  interface User extends DefaultUser {
    role?: string;
    pwv?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    uid?: string;
    pwv?: string;
  }
}
