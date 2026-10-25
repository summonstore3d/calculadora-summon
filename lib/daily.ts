// Resumo do dia: o que pede atenção hoje, em ordem de urgência. Usado no painel e no e-mail da manhã.
import { addDays, remainingOf } from "./finance.ts";
import { cents, localDay, money, type AppState, type Order } from "./summon.ts";
import type { PageId } from "./navigation.ts";

export type DailyTone = "danger" | "warning" | "info";
export type DailyItem = {
  key: string;
  tone: DailyTone;
  title: string;
  detail: string;
  amount?: number;
  page: PageId;
  record?: string;
};

/** Pedido aprovado sem andar há mais que isso (dias) aparece como parado; enviado, depois do dobro. */
export const STALLED_DAYS = 5;
const OPEN_ORDER = ["aprovado", "producao", "pronto", "enviado"] as const;
const ORDER_LABEL: Record<string, string> = {
  aprovado: "aprovado",
  producao: "em produção",
  pronto: "pronto",
  enviado: "enviado",
};
const TONE_ORDER: Record<DailyTone, number> = { danger: 0, warning: 1, info: 2 };

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[], max = 3) =>
  names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} e mais ${names.length - max}`;
const lastMove = (order: Order) => order.history?.at(-1)?.createdAt || order.createdAt;

export function dailySummary(state: AppState, reference = new Date()) {
  const day = localDay(reference),
    items: DailyItem[] = [];

  // Contas a pagar
  const open = state.expenses.filter((e) => e.status === "pendente");
  const overdue = open.filter((e) => e.dueDate < day),
    dueToday = open.filter((e) => e.dueDate === day),
    soon = open.filter((e) => e.dueDate > day && e.dueDate <= addDays(day, 3));
  const sum = (rows: { amount: number }[]) => cents(rows.reduce((a, r) => a + r.amount, 0));
  if (overdue.length)
    items.push({
      key: "contas-atrasadas",
      tone: "danger",
      title: `${plural(overdue.length, "conta atrasada", "contas atrasadas")}`,
      detail: list(overdue.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((e) => e.description)),
      amount: sum(overdue),
      page: "finance",
    });
  if (dueToday.length)
    items.push({
      key: "contas-hoje",
      tone: "warning",
      title: `${plural(dueToday.length, "conta vence", "contas vencem")} hoje`,
      detail: list(dueToday.map((e) => e.description)),
      amount: sum(dueToday),
      page: "finance",
    });
  if (soon.length)
    items.push({
      key: "contas-proximas",
      tone: "info",
      title: `${plural(soon.length, "conta vence", "contas vencem")} nos próximos 3 dias`,
      detail: list(soon.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((e) => e.description)),
      amount: sum(soon),
      page: "finance",
    });

  // Contas a receber vencidas
  const late = state.payments.filter(
    (p) => (p.status === "pendente" || p.status === "parcial") && p.dueDate < day && remainingOf(p) > 0,
  );
  if (late.length) {
    const names = late.map((p) => {
      const order = state.orders.find((o) => o.id === p.orderId);
      return order ? `${order.number} (${order.customerName})` : "pedido";
    });
    items.push({
      key: "receber-atrasado",
      tone: "warning",
      title: `${plural(late.length, "recebimento atrasado", "recebimentos atrasados")}`,
      detail: list(names),
      amount: cents(late.reduce((a, p) => a + remainingOf(p), 0)),
      page: "finance",
    });
  }

  // Estoque abaixo do mínimo
  const lowMaterials = state.materials.filter(
    (m) => m.status === "active" && m.minimumGrams > 0 && m.stockGrams <= m.minimumGrams,
  );
  const lowSupplies = (state.supplies || []).filter((x) => x.status === "active" && x.minimum > 0 && x.stock <= x.minimum);
  if (lowMaterials.length || lowSupplies.length)
    items.push({
      key: "insumo-minimo",
      tone: lowMaterials.some((m) => m.stockGrams <= 0) || lowSupplies.some((x) => x.stock <= 0) ? "danger" : "warning",
      title: `${plural(lowMaterials.length + lowSupplies.length, "insumo abaixo", "insumos abaixo")} do mínimo`,
      detail: list([...lowMaterials.map((m) => `${m.type} ${m.color}`), ...lowSupplies.map((x) => x.name)]),
      page: "restock",
    });
  const lowProducts = state.products.filter(
    (p) => p.status === "active" && p.fulfillment !== "made-to-order" && p.minimumStock > 0 && p.readyStock < p.minimumStock,
  );
  if (lowProducts.length)
    items.push({
      key: "produto-minimo",
      tone: "info",
      title: `${plural(lowProducts.length, "produto pronto abaixo", "produtos prontos abaixo")} do mínimo`,
      detail: list(lowProducts.map((p) => `${p.name} (${p.readyStock} de ${p.minimumStock})`)),
      page: "stock",
    });

  // Pedidos parados
  const stalled = state.orders.filter((o) => {
    if (!(OPEN_ORDER as readonly string[]).includes(o.status)) return false;
    return days(localDay(lastMove(o)), day) > (o.status === "enviado" ? STALLED_DAYS * 2 : STALLED_DAYS);
  });
  for (const order of stalled.sort((a, b) => lastMove(a).localeCompare(lastMove(b))).slice(0, 5))
    items.push({
      key: `pedido-parado:${order.id}`,
      tone: "warning",
      title: `${order.number} parado há ${days(localDay(lastMove(order)), day)} dias`,
      detail: `${order.customerName} · ${ORDER_LABEL[order.status]}${order.status === "enviado" ? ". Confirme a entrega para concluir a venda" : ""}`,
      amount: order.netRevenue,
      page: "orders",
      record: order.number,
    });
  if (stalled.length > 5)
    items.push({
      key: "pedidos-parados-mais",
      tone: "info",
      title: `Mais ${plural(stalled.length - 5, "pedido parado", "pedidos parados")}`,
      detail: "Veja todos em Pedidos",
      page: "orders",
    });

  // Produção atrasada
  const lateProduction = state.productionOrders.filter(
    (o) => o.dueDate && o.dueDate < day && o.status !== "concluida" && o.status !== "cancelada",
  );
  if (lateProduction.length)
    items.push({
      key: "producao-atrasada",
      tone: "warning",
      title: `${plural(lateProduction.length, "ordem de produção atrasada", "ordens de produção atrasadas")}`,
      detail: list(
        lateProduction.map((o) => `${o.number} (${state.products.find((p) => p.id === o.productId)?.name || "produto"})`),
      ),
      page: "production",
    });

  // Produção sem material suficiente
  const blocked = state.productionOrders.filter(
    (o) =>
      !["concluida", "cancelada"].includes(o.status) &&
      o.plannedConsumption.some(
        (part) => (state.materials.find((m) => m.id === part.materialId)?.stockGrams ?? 0) < part.weightGrams,
      ),
  );
  if (blocked.length)
    items.push({
      key: "producao-sem-material",
      tone: "danger",
      title: `${plural(blocked.length, "ordem de produção", "ordens de produção")} sem filamento suficiente`,
      detail: list(blocked.map((o) => o.number)),
      page: "restock",
    });

  // Manutenção: máquina parada para manutenção, ou sem manutenção registrada há mais de 90 dias
  const maintenance = state.machines.filter(
    (m) =>
      m.status === "maintenance" ||
      (m.status === "active" && (m.lastMaintenance ? days(m.lastMaintenance, day) > 90 : m.accumulatedHours > 0)),
  );
  if (maintenance.length)
    items.push({
      key: "manutencao",
      tone: "info",
      title: `${plural(maintenance.length, "máquina pede", "máquinas pedem")} manutenção`,
      detail: list(maintenance.map((m) => (m.status === "maintenance" ? `${m.name} (parada)` : m.name))),
      page: "machines",
    });

  // Orçamentos
  const validity = state.settings.quoteValidityDays ?? 7;
  const quotes = state.orders
    .filter((o) => o.status === "orcamento")
    .map((o) => ({ order: o, until: addDays(localDay(o.createdAt), validity) }));
  const expiring = quotes.filter((q) => q.until >= day && q.until <= addDays(day, 2)),
    expired = quotes.filter((q) => q.until < day);
  if (expiring.length)
    items.push({
      key: "orcamentos-vencendo",
      tone: "info",
      title: `${plural(expiring.length, "orçamento vence", "orçamentos vencem")} em até 2 dias`,
      detail: `Bom momento para falar com ${list(expiring.map((q) => q.order.customerName))}`,
      amount: cents(expiring.reduce((a, q) => a + q.order.netRevenue, 0)),
      page: "orders",
    });
  if (expired.length)
    items.push({
      key: "orcamentos-vencidos",
      tone: "info",
      title: `${plural(expired.length, "orçamento vencido", "orçamentos vencidos")} sem resposta`,
      detail: `Renove ou cancele: ${list(expired.map((q) => `${q.order.number} (${q.order.customerName})`))}`,
      page: "orders",
    });

  items.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone]);
  return {
    day,
    items,
    urgent: items.filter((i) => i.tone !== "info").length,
  };
}

/** Texto simples do resumo (para o e-mail). */
export function dailyText(summary: ReturnType<typeof dailySummary>, business = "Gestão 3D") {
  const [y, m, d] = summary.day.split("-");
  if (!summary.items.length) return `${business} · ${d}/${m}/${y}\n\nNada pedindo atenção hoje.`;
  return [
    `${business} · ${d}/${m}/${y}`,
    "",
    ...summary.items.map(
      (i) =>
        `${i.tone === "danger" ? "🔴" : i.tone === "warning" ? "🟡" : "🔵"} ${i.title}${i.amount ? ` · ${money(i.amount)}` : ""}\n   ${i.detail}`,
    ),
  ].join("\n");
}
