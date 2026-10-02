import { NextResponse, type NextRequest } from "next/server";

// Optimistic check only: pages verify the signed session themselves (lib/session.ts).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("tp_session")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Pages only. API routes are excluded so video uploads are never buffered by the proxy.
  matcher: ["/((?!api|login|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
