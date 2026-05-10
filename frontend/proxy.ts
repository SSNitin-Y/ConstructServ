// frontend/proxy.ts
import { NextRequest, NextResponse } from "next/server";

export function proxy(req: NextRequest) {
  const authed = req.cookies.get("rukmer_auth")?.value === "1";
  if (authed) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", `${pathname}${search}`);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/analysis/:path*", "/library/:path*", "/job/:path*", "/media/:path*"],
};
