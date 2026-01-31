import { getIronSession, type IronSessionData, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionUser = {
  authed: true;
};

declare module "iron-session" {
  interface IronSessionData {
    user?: SessionUser;
  }
}

export const sessionOptions: SessionOptions = {
  cookieName: "meeting_hub",
  password:
    process.env.SESSION_PASSWORD ||
    // dev fallback; DO NOT use in production
    "dev_password_dev_password_dev_password_dev_password",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

export async function getSession() {
  const cookieStore = await cookies();
  return getIronSession<IronSessionData>(cookieStore, sessionOptions);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session.user?.authed) throw new Error("UNAUTHENTICATED");
  return session;
}
