// frontend/app/api/session/route.ts
import { NextRequest, NextResponse } from "next/server";

const isProd = process.env.NODE_ENV === "production";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = body?.token;

  if (!token || typeof token !== "string") {
    return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });

  res.cookies.set("rukmer_auth", "1", {
    httpOnly: true,
    secure: isProd, // false on localhost, true in production
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });

  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("rukmer_auth", "", {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
