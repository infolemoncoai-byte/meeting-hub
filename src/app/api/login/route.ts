import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") || "");

  const expected = process.env.MEETING_HUB_PASSWORD || "";
  if (!expected) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  if (password !== expected) {
    return NextResponse.redirect(new URL("/login?err=1", req.url));
  }

  const session = await getSession();
  session.user = { authed: true };
  await session.save();

  return NextResponse.redirect(new URL("/", req.url));
}
