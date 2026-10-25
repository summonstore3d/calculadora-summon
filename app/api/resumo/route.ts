import { PASSWORD_OWNER_ID } from "@/app/password-auth";
import { getDatabaseProvider } from "@/db/provider";
import { loadNormalizedState } from "@/db/state-repository";
import { dailySummary, dailyText } from "@/lib/daily";
import { money } from "@/lib/summon";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const escape = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Comparação em tempo constante, para a chave não vazar pelo tempo de resposta. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/**
 * E-mail da manhã com o resumo do dia. Chamado pela Vercel uma vez por dia (vercel.json → crons),
 * que manda "Authorization: Bearer <CRON_SECRET>". Só envia se houver algo pedindo atenção.
 *
 * Variáveis: CRON_SECRET, RESEND_API_KEY, RESUMO_EMAIL_PARA e, opcional, RESUMO_EMAIL_DE.
 * Sem domínio próprio no Resend, o remetente padrão (onboarding@resend.dev) só entrega para o
 * e-mail da conta do Resend, o que basta para receber o próprio resumo.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET || "",
    header = request.headers.get("authorization") || "";
  if (secret.length < 16 || !header.startsWith("Bearer ") || !sameSecret(header.slice(7), secret))
    return Response.json({ error: "Sem permissão." }, { status: 401, headers: NO_STORE });
  const apiKey = process.env.RESEND_API_KEY,
    to = process.env.RESUMO_EMAIL_PARA;
  if (!apiKey || !to) return Response.json({ skipped: "E-mail não configurado." }, { headers: NO_STORE });
  const db = getDatabaseProvider();
  if (!db) return Response.json({ skipped: "Sem banco configurado." }, { headers: NO_STORE });

  const data = await loadNormalizedState(db, PASSWORD_OWNER_ID);
  if (!data) return Response.json({ skipped: "Sem dados." }, { headers: NO_STORE });
  const summary = dailySummary(data.state);
  if (!summary.items.length) return Response.json({ skipped: "Nada pedindo atenção hoje." }, { headers: NO_STORE });

  const business = data.state.settings.businessName?.trim() || "Gestão 3D",
    origin = new URL(request.url).origin,
    [y, m, d] = summary.day.split("-");
  const color = { danger: "#d92d20", warning: "#f79009", info: "#2e90fa" };
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;color:#172033">
<h2 style="margin:0 0 4px">${escape(business)}</h2>
<p style="margin:0 0 16px;color:#667085">Resumo de ${d}/${m}/${y}</p>
${summary.items
  .map(
    (
      i,
    ) => `<div style="padding:10px 12px;margin-bottom:6px;border:1px solid #e4e7ec;border-left:4px solid ${color[i.tone]};border-radius:8px">
<b>${escape(i.title)}</b>${i.amount ? ` · ${escape(money(i.amount))}` : ""}<br><span style="color:#667085;font-size:14px">${escape(i.detail)}</span></div>`,
  )
  .join("\n")}
<p style="margin-top:16px"><a href="${escape(origin)}" style="color:#155eef">Abrir o sistema</a></p>
</div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESUMO_EMAIL_DE || `${business} <onboarding@resend.dev>`,
      to: to
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean),
      subject: `${summary.urgent ? `${summary.urgent} urgente${summary.urgent === 1 ? "" : "s"} · ` : ""}Resumo do dia ${d}/${m}`,
      text: `${dailyText(summary, business)}\n\n${origin}`,
      html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return Response.json(
      { error: `O Resend recusou o envio (${response.status}). ${detail.slice(0, 300)}` },
      { status: 502, headers: NO_STORE },
    );
  }
  return Response.json({ sent: summary.items.length }, { headers: NO_STORE });
}
