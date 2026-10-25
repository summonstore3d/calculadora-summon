import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { PASSWORD_OWNER_ID, SESSION_COOKIE, readCookie, safeReturnPath, verifySessionValue } from "./password-auth";

export type CurrentUser = { userId: string; displayName: string };

/** Dono do sistema, quando a sessão criada em /entrar é válida. Sem sessão, null. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = readCookie((await headers()).get("cookie"), SESSION_COOKIE);
  if (!(await verifySessionValue(session))) return null;
  // Mantém o identificador usado desde o início, para os dados já gravados continuarem do dono.
  return { userId: PASSWORD_OWNER_ID, displayName: "Administrador" };
}

/** Para páginas: sem sessão, leva para a tela de senha e volta para cá depois. */
export async function requireUser(returnTo: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (user) return user;
  redirect(`/entrar?return_to=${encodeURIComponent(safeReturnPath(returnTo))}`);
}
