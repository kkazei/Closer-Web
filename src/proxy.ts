import { NextResponse, type NextRequest } from "next/server";

import {
  AUTH_COOKIE_NAME,
  verifyToken,
} from "@/lib/auth/session";

const protectedPagePrefixes = ["/dashboard", "/account"];

function isProtectedPage(pathname: string): boolean {
  return protectedPagePrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isProtectedApi(pathname: string): boolean {
  return pathname === "/api/dashboard" || pathname.startsWith("/api/dashboard/");
}

function clearInvalidSessionCookie(response: NextResponse): void {
  response.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    maxAge: 0,
    path: "/",
  });
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const token = await verifyToken(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  const protectedRequest = isProtectedPage(pathname) || isProtectedApi(pathname);

  if (protectedRequest && !token) {
    if (isProtectedApi(pathname)) {
      const response = NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
      response.headers.set("Cache-Control", "no-store");

      if (request.cookies.has(AUTH_COOKIE_NAME)) {
        clearInvalidSessionCookie(response);
      }

      return response;
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(`${pathname}${request.nextUrl.search}`)}`;
    const response = NextResponse.redirect(loginUrl);

    if (request.cookies.has(AUTH_COOKIE_NAME)) {
      clearInvalidSessionCookie(response);
    }

    return response;
  }

  const response = NextResponse.next();

  if (!token && request.cookies.has(AUTH_COOKIE_NAME)) {
    clearInvalidSessionCookie(response);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
