import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { QuoteView } from "@/components/quote-view";
import { buildQuote } from "@/lib/quote";
import { getDatabaseProvider } from "@/db/provider";
import { loadNormalizedState } from "@/db/state-repository";
import { PASSWORD_OWNER_ID } from "@/app/password-auth";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Orçamento", robots: { index: false, follow: false } };

/** Página pública do orçamento. Aberta sem senha, só por quem tem o link; desativar o link no pedido tira a página do ar. */
export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{32}$/.test(token)) notFound();
  const db = getDatabaseProvider();
  const data = db ? await loadNormalizedState(db, PASSWORD_OWNER_ID).catch(() => undefined) : undefined;
  const order = data?.state.orders.find((o) => o.quoteToken === token);
  if (!data || !order || order.status === "cancelado") notFound();
  return (
    <main className="quote-page">
      <QuoteView quote={buildQuote(data.state, order)} />
      <p className="quote-print-hint">Para guardar, use Imprimir no navegador e escolha Salvar como PDF.</p>
    </main>
  );
}
