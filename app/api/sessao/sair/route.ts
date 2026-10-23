import { clearSessionCookieHeader } from "@/app/password-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = new Headers({
    Location: new URL("/entrar", request.url).toString(),
    "Cache-Control": "no-store",
  });
  headers.append("Set-Cookie", clearSessionCookieHeader());
  return new Response(null, { status: 303, headers });
}
