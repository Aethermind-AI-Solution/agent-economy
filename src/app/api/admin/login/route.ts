import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/admin/login
 *
 * Accepts the admin password via form submission or JSON body,
 * sets an HttpOnly cookie, and redirects to the dashboard.
 * Password never appears in a URL or server access log.
 */
export async function POST(req: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 503 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  let key: string | undefined;

  if (contentType.includes("application/json")) {
    try {
      const body = await req.json();
      key = body.key;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  } else {
    const form = await req.formData();
    key = form.get("key")?.toString();
  }

  if (!key || key !== adminPassword) {
    // Redirect back to login with error flag — never expose the wrong key
    const origin = new URL(req.url).origin;
    const res = NextResponse.redirect(new URL("/?login_error=1", origin));
    return res;
  }

  const origin = new URL(req.url).origin;
  const res = NextResponse.redirect(new URL("/", origin));
  res.cookies.set("admin_key", key, {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 60 * 60 * 8, // 8 hours
  });
  return res;
}
