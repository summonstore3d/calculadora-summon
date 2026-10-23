// Regras do financeiro: contas a pagar e a receber, extrato de caixa e resultado do mês.
//
// Dois olhares diferentes sobre o dinheiro:
// - Caixa (extrato): o que entrou e saiu de fato, na data do pagamento. Inclui compras de
//   filamento, manutenções e impostos pagos.
// - Resultado (DRE): o que o mês vendeu e quanto custou, pela data da venda e do vencimento.
//   Compras de filamento e manutenção NÃO entram como despesa aqui, porque o filamento e a
//   reserva de manutenção já estão no custo das peças vendidas. A categoria "Impostos" também
//   fica fora, porque o imposto sobre as vendas já é calculado em cada pedido.
import {
  cents, localDay, localMonth, normalize, receivableAmount, today, uid,
  type AppState, type Expense, type Machine, type Maintenance, type Order, type Payment, type Purchase, type Receipt, type Settings,
} from "./summon.ts";

export const PURCHASE_CATEGORY = "Compra de filamento";
export const MAINTENANCE_CATEGORY = "Manutenção de máquinas";
export const EXPENSE_CATEGORIES = ["Aluguel", "Energia elétrica", "Internet", "Embalagens", "Marketing", "Software e assinaturas", "Ferramentas", "Impostos", "Pró-labore", "Outros"];

const sum = (values: number[]) => cents(values.reduce((total, value) => total + (Number(value) || 0), 0));

export function addDays(day: string, days: number) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12));
  return date.toISOString().slice(0, 10);
}

/** Soma meses mantendo o dia; quando o mês é mais curto, usa o último dia (31/01 + 1 mês = 28/02). */
export function addMonths(day: string, months: number) {
  const [y, m, d] = day.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1, 12));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0, 12)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  const label = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Divide um valor em parcelas de centavos exatos; a diferença de arredondamento vai para a última. */
export function splitAmount(total: number, parts: number) {
  const count = Math.max(1, Math.trunc(parts)), base = Math.floor((total / count) * 100) / 100;
  return Array.from({ length: count }, (_, index) => (index === count - 1 ? cents(total - base * (count - 1)) : base));
}

// ---------------------------------------------------------------- a receber

export function receiptsOf(payment: Payment): Receipt[] {
  if (payment.receipts?.length) return payment.receipts;
  if (payment.received > 0) return [{ id: `${payment.id}:inicial`, amount: payment.received, date: localDay(payment.receivedAt || payment.dueDate), method: payment.method }];
  return [];
}

export const remainingOf = (payment: Payment) => (payment.status === "estornado" ? 0 : Math.max(0, cents(payment.expected - payment.received)));

/** Quanto e quando o pedido deve entrar no caixa. Marketplaces repassam o valor sem as taxas, alguns dias depois. */
export function expectedReceivable(order: Pick<Order, "channel" | "netRevenue" | "fees" | "createdAt">, settings: Settings) {
  const day = localDay(order.createdAt) || today();
  const expected = receivableAmount(order);
  if (order.channel === "shopee") return { expected, dueDate: addDays(day, settings.shopeeReleaseDays ?? 15) };
  if (order.channel === "ml") return { expected, dueDate: addDays(day, settings.mlReleaseDays ?? 15) };
  return { expected, dueDate: day };
}

export function receivePayment(state: AppState, paymentId: string, input: { amount: number; date: string; method: string; note?: string }) {
  const payment = state.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Recebimento não encontrado");
  if (payment.status === "estornado") throw new Error("Este pedido foi devolvido; o recebimento está estornado");
  const amount = cents(input.amount), remaining = remainingOf(payment);
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero");
  if (remaining <= 0) throw new Error("Este pedido já está quitado");
  if (amount > remaining + 0.009) throw new Error(`O valor passa do saldo em aberto (${remaining.toFixed(2).replace(".", ",")})`);
  if (!input.date) throw new Error("Informe a data do recebimento");
  const receipts = [...receiptsOf(payment), { id: uid(), amount, date: input.date, method: input.method || payment.method, note: input.note }];
  const received = sum(receipts.map((r) => r.amount)), status = received >= payment.expected - 0.009 ? ("pago" as const) : ("parcial" as const);
  return {
    ...state,
    payments: state.payments.map((p) => (p.id === paymentId ? { ...p, receipts, received, receivedAt: input.date, status } : p)),
    orders: state.orders.map((o) => (o.id === payment.orderId ? { ...o, paymentStatus: status } : o)),
  };
}

// ---------------------------------------------------------------- a pagar

export type ExpenseInput = { description: string; category: string; amount: number; dueDate: string; recurring: boolean; note: string; paidAt?: string; installments?: number };

export function createExpenses(state: AppState, input: ExpenseInput) {
  const description = input.description.trim(), amount = cents(input.amount), installments = Math.max(1, Math.trunc(input.installments || 1));
  if (!description) throw new Error("Informe a descrição");
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero");
  if (!input.dueDate) throw new Error("Informe o vencimento");
  const createdAt = new Date().toISOString(), seriesId = uid(), category = input.category.trim() || "Outros";
  const expenses: Expense[] = splitAmount(amount, installments).map((value, index) => ({
    id: uid(),
    description: installments > 1 ? `${description} (${index + 1}/${installments})` : description,
    category,
    amount: value,
    dueDate: addMonths(input.dueDate, index),
    paidAt: installments === 1 ? input.paidAt || undefined : undefined,
    recurring: installments === 1 && input.recurring,
    status: installments === 1 && input.paidAt ? "pago" : "pendente",
    note: input.note.trim(),
    createdAt,
    seriesId: installments > 1 || input.recurring ? seriesId : undefined,
    installment: installments > 1 ? { index: index + 1, total: installments } : undefined,
  }));
  return { ...state, expenses: [...state.expenses, ...expenses] };
}

export function updateExpense(state: AppState, expenseId: string, patch: Partial<Pick<Expense, "description" | "category" | "amount" | "dueDate" | "paidAt" | "recurring" | "note">>) {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) throw new Error("Despesa não encontrada");
  if (expense.status === "cancelado") throw new Error("Despesa cancelada não pode ser editada");
  if (patch.description !== undefined && !patch.description.trim()) throw new Error("Informe a descrição");
  if (patch.amount !== undefined && !(patch.amount > 0)) throw new Error("Informe um valor maior que zero");
  if (expense.status === "pago" && patch.paidAt === "") throw new Error("Informe a data do pagamento");
  return { ...state, expenses: state.expenses.map((e) => (e.id === expenseId ? { ...e, ...patch, amount: patch.amount !== undefined ? cents(patch.amount) : e.amount } : e)) };
}

export function cancelExpense(state: AppState, expenseId: string) {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) throw new Error("Despesa não encontrada");
  if (expense.status !== "pendente") throw new Error("Só contas em aberto podem ser canceladas");
  return { ...state, expenses: state.expenses.map((e) => (e.id === expenseId ? { ...e, status: "cancelado" as const } : e)) };
}

/** Paga uma conta. Se ela é recorrente, já deixa a do mês seguinte em aberto. */
export function payExpense(state: AppState, expenseId: string, input: { date: string; amount?: number }) {
  const expense = state.expenses.find((e) => e.id === expenseId);
  if (!expense) throw new Error("Despesa não encontrada");
  if (expense.status !== "pendente") throw new Error("Esta conta não está em aberto");
  if (!input.date) throw new Error("Informe a data do pagamento");
  const amount = input.amount === undefined ? expense.amount : cents(input.amount);
  if (!(amount > 0)) throw new Error("Informe um valor maior que zero");
  const seriesId = expense.seriesId || expense.id;
  let expenses = state.expenses.map((e) => (e.id === expenseId ? { ...e, amount, status: "pago" as const, paidAt: input.date, seriesId: e.recurring ? seriesId : e.seriesId } : e));
  if (expense.recurring) {
    const nextDue = addMonths(expense.dueDate, 1);
    const exists = expenses.some((e) => e.id !== expense.id && (e.seriesId || e.id) === seriesId && localMonth(e.dueDate) === localMonth(nextDue));
    if (!exists) expenses = [...expenses, { ...expense, id: uid(), amount: expense.amount, dueDate: nextDue, paidAt: undefined, status: "pendente", seriesId, createdAt: new Date().toISOString() }];
  }
  return { ...state, expenses };
}

export type PurchasePaymentPlan = { mode: "paid" | "due" | "installments"; dueDate?: string; installments?: number };

/** Contas a pagar geradas por uma compra de filamento. */
export function purchaseExpenses(purchase: Purchase, materialLabel: string, plan: PurchasePaymentPlan): Expense[] {
  const createdAt = new Date().toISOString(), base = `Compra ${materialLabel} (${String(purchase.kg).replace(".", ",")} kg)`, source = { kind: "purchase" as const, id: purchase.id };
  if (plan.mode === "paid") return [{ id: uid(), description: base, category: PURCHASE_CATEGORY, amount: cents(purchase.total), dueDate: purchase.date, paidAt: purchase.date, recurring: false, status: "pago", note: purchase.note, createdAt, source }];
  const count = plan.mode === "installments" ? Math.max(2, Math.trunc(plan.installments || 2)) : 1, first = plan.dueDate || purchase.date, seriesId = uid();
  return splitAmount(purchase.total, count).map((amount, index) => ({
    id: uid(), description: count > 1 ? `${base} (${index + 1}/${count})` : base, category: PURCHASE_CATEGORY, amount, dueDate: addMonths(first, index), recurring: false, status: "pendente" as const, note: purchase.note, createdAt, source,
    seriesId: count > 1 ? seriesId : undefined, installment: count > 1 ? { index: index + 1, total: count } : undefined,
  }));
}

export function maintenanceExpense(maintenance: Maintenance, machine?: Pick<Machine, "name">): Expense {
  return { id: uid(), description: `Manutenção ${maintenance.kind} · ${machine?.name || "máquina"}`, category: MAINTENANCE_CATEGORY, amount: cents(maintenance.cost), dueDate: maintenance.date, paidAt: maintenance.date, recurring: false, status: "pago", note: maintenance.note, createdAt: new Date().toISOString(), source: { kind: "maintenance", id: maintenance.id } };
}

/** Ao estornar uma compra, as parcelas ainda em aberto deixam de existir. As já pagas continuam no caixa. */
export function cancelPurchaseExpenses(state: AppState, purchaseId: string) {
  return { ...state, expenses: state.expenses.map((e) => (e.source?.kind === "purchase" && e.source.id === purchaseId && e.status === "pendente" ? { ...e, status: "cancelado" as const, note: e.note ? `${e.note} · Compra estornada` : "Compra estornada" } : e)) };
}

// ---------------------------------------------------------------- caixa

export type LedgerEntry = { id: string; date: string; kind: "in" | "out"; category: string; description: string; amount: number; page?: string; record?: string };

export function cashLedger(state: AppState, month?: string): LedgerEntry[] {
  const entries: LedgerEntry[] = [], orderOf = (id: string) => state.orders.find((o) => o.id === id);
  for (const payment of state.payments) {
    const order = orderOf(payment.orderId), label = order ? `${order.number} · ${order.customerName}` : "Pedido";
    for (const receipt of receiptsOf(payment)) entries.push({ id: `rc-${receipt.id}`, date: localDay(receipt.date), kind: "in", category: "Vendas", description: `Recebimento ${label}`, amount: receipt.amount, page: "orders", record: order?.number });
    if (payment.status === "estornado" && payment.received > 0) entries.push({ id: `rf-${payment.id}`, date: localDay(order?.returnedAt || payment.receivedAt || payment.dueDate), kind: "out", category: "Devoluções", description: `Devolução ${label}`, amount: payment.received, page: "orders", record: order?.number });
  }
  for (const e of state.expenses) if (e.status === "pago") entries.push({ id: `ex-${e.id}`, date: localDay(e.paidAt || e.dueDate), kind: "out", category: e.category, description: e.description, amount: e.amount, page: "finance" });
  // Registros anteriores a esta versão: compras e manutenções sem conta a pagar vinculada saem do caixa na própria data.
  const linked = new Set(state.expenses.filter((e) => e.source).map((e) => `${e.source!.kind}:${e.source!.id}`));
  for (const p of state.purchases) if (!linked.has(`purchase:${p.id}`)) {
    const m = state.materials.find((x) => x.id === p.materialId);
    entries.push({ id: `pu-${p.id}`, date: localDay(p.date), kind: "out", category: PURCHASE_CATEGORY, description: `Compra ${m ? `${m.type} ${m.color}` : "de material"} (${String(p.kg).replace(".", ",")} kg)`, amount: p.total, page: "purchases" });
  }
  for (const mt of state.maintenances) if (mt.cost > 0 && !linked.has(`maintenance:${mt.id}`)) {
    const machine = state.machines.find((x) => x.id === mt.machineId);
    entries.push({ id: `mt-${mt.id}`, date: localDay(mt.date), kind: "out", category: MAINTENANCE_CATEGORY, description: `Manutenção ${mt.kind} · ${machine?.name || "máquina"}`, amount: mt.cost, page: "machines" });
  }
  // Custos pagos na venda: frete, outros custos e anúncios informados no pedido.
  for (const o of state.orders) if (o.status === "concluido" || o.status === "devolvido") {
    const date = localDay(o.completedAt || o.createdAt);
    if (o.shippingPaid > 0) entries.push({ id: `sh-${o.id}`, date, kind: "out", category: "Frete", description: `Frete ${o.number}`, amount: o.shippingPaid, page: "orders", record: o.number });
    if (o.otherCosts > 0) entries.push({ id: `oc-${o.id}`, date, kind: "out", category: "Custos de venda", description: `Outros custos ${o.number}`, amount: o.otherCosts, page: "orders", record: o.number });
    if (o.advertisingCost > 0) entries.push({ id: `ad-${o.id}`, date, kind: "out", category: "Anúncios", description: `Anúncios ${o.number}`, amount: o.advertisingCost, page: "orders", record: o.number });
  }
  return entries.filter((e) => !month || localMonth(e.date) === month).sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? 0 : a.kind === "in" ? -1 : 1));
}

/** Saldo de caixa no início do mês: o saldo inicial informado em Parâmetros mais tudo o que entrou e saiu antes. */
export function openingBalance(state: AppState, month: string) {
  return cents((state.settings.openingCash || 0) + sum(cashLedger(state).filter((e) => localMonth(e.date) < month).map((e) => (e.kind === "in" ? e.amount : -e.amount))));
}

// ---------------------------------------------------------------- resultado

export type DreLine = { key: string; label: string; value: number; kind: "revenue" | "deduction" | "subtotal" | "result"; detail?: string };

const excludedFromDre = (e: Expense) => Boolean(e.source) || normalize(e.category) === "impostos" || normalize(e.category) === normalize(PURCHASE_CATEGORY) || normalize(e.category) === normalize(MAINTENANCE_CATEGORY);
/** Se a despesa entra no resultado (DRE), no lucro do painel e nos relatórios, pela data de vencimento. */
export const countsInResult = (e: Expense) => e.status !== "cancelado" && !excludedFromDre(e);

export function monthlyDre(state: AppState, month: string) {
  const orders = state.orders.filter((o) => o.status === "concluido" && localMonth(o.completedAt || o.createdAt) === month);
  const gross = sum(orders.map((o) => o.gross)), net = sum(orders.map((o) => o.netRevenue)), discounts = cents(gross - net);
  const fees = sum(orders.map((o) => o.fees)), taxes = sum(orders.map((o) => o.taxes)), cogs = sum(orders.map((o) => o.cost));
  const shipping = sum(orders.map((o) => o.shippingPaid)), otherSale = sum(orders.map((o) => o.otherCosts)), ads = sum(orders.map((o) => o.advertisingCost));
  const contribution = cents(net - fees - taxes - cogs - shipping - otherSale - ads);
  const expenses = state.expenses.filter((e) => e.status !== "cancelado" && localMonth(e.dueDate) === month && !excludedFromDre(e));
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category, cents((byCategory.get(e.category) || 0) + e.amount));
  const opex = sum(expenses.map((e) => e.amount)), result = cents(contribution - opex);
  const lines: DreLine[] = [
    { key: "gross", label: "Receita bruta", value: gross, kind: "revenue", detail: `${orders.length} venda${orders.length === 1 ? "" : "s"} concluída${orders.length === 1 ? "" : "s"}` },
    { key: "discounts", label: "(−) Descontos", value: -discounts, kind: "deduction" },
    { key: "net", label: "Receita líquida", value: net, kind: "subtotal" },
    { key: "fees", label: "(−) Taxas de marketplace", value: -fees, kind: "deduction" },
    { key: "taxes", label: "(−) Impostos sobre vendas", value: -taxes, kind: "deduction" },
    { key: "cogs", label: "(−) Custo das peças vendidas", value: -cogs, kind: "deduction", detail: "Filamento, energia, máquina, mão de obra e embalagem dos lotes vendidos" },
    { key: "shipping", label: "(−) Frete pago", value: -shipping, kind: "deduction" },
    { key: "otherSale", label: "(−) Outros custos de venda", value: -otherSale, kind: "deduction" },
    { key: "ads", label: "(−) Anúncios atribuídos aos pedidos", value: -ads, kind: "deduction" },
    { key: "contribution", label: "Margem de contribuição", value: contribution, kind: "subtotal" },
    ...[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([category, value]) => ({ key: `opex:${category}`, label: `(−) ${category}`, value: -value, kind: "deduction" as const })),
    { key: "opex", label: "Despesas operacionais", value: -opex, kind: "subtotal" },
    { key: "result", label: "Lucro líquido", value: result, kind: "result" },
  ];
  return { orders: orders.length, gross, net, contribution, opex, result, margin: net ? cents((result / net) * 100) : 0, lines };
}

// ---------------------------------------------------------------- resumo

export function accountsSummary(state: AppState, reference = today()) {
  const in7 = addDays(reference, 7), in30 = addDays(reference, 30);
  const payables = state.expenses.filter((e) => e.status === "pendente");
  const receivables = state.payments.filter((p) => (p.status === "pendente" || p.status === "parcial") && remainingOf(p) > 0);
  return {
    payable: sum(payables.map((e) => e.amount)),
    payableOverdue: payables.filter((e) => e.dueDate < reference),
    payableWeek: payables.filter((e) => e.dueDate >= reference && e.dueDate <= in7),
    receivable: sum(receivables.map(remainingOf)),
    receivableOverdue: receivables.filter((p) => p.dueDate < reference),
    next30In: sum(receivables.filter((p) => p.dueDate <= in30).map(remainingOf)),
    next30Out: sum(payables.filter((e) => e.dueDate <= in30).map((e) => e.amount)),
  };
}

/** Meses com movimento, mais o atual, do mais recente para o mais antigo. */
export function financeMonths(state: AppState) {
  const months = new Set<string>([localMonth(today())]);
  for (const e of cashLedger(state)) months.add(localMonth(e.date));
  for (const e of state.expenses) months.add(localMonth(e.dueDate));
  for (const o of state.orders) if (o.status === "concluido") months.add(localMonth(o.completedAt || o.createdAt));
  return [...months].filter(Boolean).sort().reverse();
}
