// Acesso por senha para a hospedagem na Vercel, onde não existem os cabeçalhos
// de login do ChatGPT Sites. Sem APP_PASSWORD configurada, ninguém entra.
//
// Variáveis de ambiente (Vercel → Settings → Environment Variables):
//   APP_PASSWORD        senha de acesso (obrigatória)
//   APP_SESSION_SECRET  chave para assinar a sessão (opcional; se ausente, usa a senha,
//                       e trocar a senha encerra todas as sessões abertas)

export const SESSION_COOKIE = "gestao3d_sessao";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
// Mantém o mesmo identificador usado antes, para que os dados já gravados no
// banco continuem vinculados ao dono.
export const PASSWORD_OWNER_ID = "vercel-local-owner";

const encoder = new TextEncoder();

export function passwordAuthConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

function sessionSecret(): string {
  return process.env.APP_SESSION_SECRET || process.env.APP_PASSWORD || "";
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return [...new Uint8Array(signature)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

/** Compara a senha informada sem revelar, pelo tempo de resposta, quantos caracteres acertou. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  const pepper = sessionSecret() + ":senha";
  const [a, b] = await Promise.all([hmacHex(pepper, candidate), hmacHex(pepper, expected)]);
  return sameText(a, b);
}

export async function createSessionValue(now = Date.now()): Promise<string> {
  const expiresAt = now + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${await hmacHex(sessionSecret(), `sessao:${expiresAt}`)}`;
}

export async function verifySessionValue(value: string | undefined | null, now = Date.now()): Promise<boolean> {
  if (!value || !passwordAuthConfigured()) return false;
  const [expiresRaw, signature] = value.split(".");
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < now || !signature) return false;
  return sameText(signature, await hmacHex(sessionSecret(), `sessao:${expiresAt}`));
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return decodeURIComponent(part.slice(index + 1).trim());
  }
  return undefined;
}

export function sessionCookieHeader(value: string, maxAge = SESSION_MAX_AGE_SECONDS): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearSessionCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

/** Aceita só caminhos internos, para que o retorno após o login não leve a outro site. */
export function safeReturnPath(value: string | null | undefined): string {
  const path = String(value || "/");
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return "/";
  if (path.startsWith("/entrar") || path.startsWith("/api/")) return "/";
  return path;
}
