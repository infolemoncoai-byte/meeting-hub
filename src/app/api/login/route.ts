import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

function wantsJson(req: Request) {
  const accept = req.headers.get("accept") || "";
  const x = req.headers.get("x-meeting-hub-client") || "";
  return accept.includes("application/json") || x === "script";
}

export async function POST(req: Request) {
  const form = await req.formData();
  const password = String(form.get("password") || "");

  const expected = process.env.MEETING_HUB_PASSWORD || "";
  if (!expected) {
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  if (password !== expected) {
    if (wantsJson(req)) {
      return NextResponse.json({ error: "invalid_password" }, { status: 401 });
    }
    // Use 303 so non-browser clients won't accidentally re-POST to /login.
    return NextResponse.redirect(new URL("/login?err=1", req.url), { status: 303 });
  }

  const session = await getSession();
  session.user = { authed: true };
  await session.save();

  if (wantsJson(req)) {
    return NextResponse.json({ ok: true });
  }

  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
