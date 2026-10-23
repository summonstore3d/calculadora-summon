import {
  createSessionValue,
  passwordAuthConfigured,
  passwordMatches,
  safeReturnPath,
  sessionCookieHeader,
} from "@/app/password-auth";

export const dynamic = "force-dynamic";

function redirectTo(request: Request, path: string, cookie?: string) {
  const headers = new Headers({ Location: new URL(path, request.url).toString(), "Cache-Control": "no-store" });
  if (cookie) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const returnTo = safeReturnPath(String(form.get("return_to") || "/"));
  const back = (code: string) => `/entrar?erro=${code}&return_to=${encodeURIComponent(returnTo)}`;

  if (!process.env.VERCEL) return redirectTo(request, "/");
  if (!passwordAuthConfigured()) return redirectTo(request, back("config"));

  if (!(await passwordMatches(String(form.get("senha") || "")))) {
    // Pequena espera para tornar tentativas em série mais lentas.
    await new Promise((resolve) => setTimeout(resolve, 800));
    return redirectTo(request, back("senha"));
  }

  return redirectTo(request, returnTo, sessionCookieHeader(await createSessionValue()));
}
