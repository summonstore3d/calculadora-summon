import { redirect } from "next/navigation";
import { Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { passwordAuthConfigured, safeReturnPath } from "@/app/password-auth";

export const dynamic = "force-dynamic";

const errors: Record<string, string> = {
  senha: "Senha incorreta. Confira e tente de novo.",
  config: "O acesso ainda não foi configurado. Cadastre APP_PASSWORD nas variáveis de ambiente da Vercel e faça um novo deploy.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string; return_to?: string }>;
}) {
  const { erro, return_to } = await searchParams;
  const returnTo = safeReturnPath(return_to);

  // Fora da Vercel o login é do ChatGPT Sites; esta página não se aplica.
  if (!process.env.VERCEL) redirect(returnTo);
  if (await getChatGPTUser()) redirect(returnTo);

  const configured = passwordAuthConfigured();
  const message = !configured ? errors.config : erro ? errors[erro] : undefined;

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <form
        method="post"
        action="/api/sessao"
        className="grid w-full max-w-sm gap-5 rounded-xl border bg-card p-6 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Layers3 className="size-5" />
          </span>
          <div className="grid">
            <strong className="text-base">Gestão de produção</strong>
            <small className="text-muted-foreground">Operação de impressão 3D</small>
          </div>
        </div>

        {message && (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {message}
          </p>
        )}

        <input type="hidden" name="return_to" value={returnTo} />
        <label className="grid gap-1.5 text-sm font-medium">
          Senha de acesso
          <Input
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
            disabled={!configured}
          />
        </label>
        <Button type="submit" disabled={!configured}>
          Entrar
        </Button>
      </form>
    </main>
  );
}
