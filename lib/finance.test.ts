import test from "node:test";
import assert from "node:assert/strict";
import { defaults, emptyState, reversePurchase, type AppState, type Order } from "./summon.ts";
import {
  accountsSummary, addMonths, cancelExpense, cashLedger, createExpenses, expectedReceivable, maintenanceExpense,
  monthlyDre, openingBalance, payExpense, purchaseExpenses, receivePayment, splitAmount,
} from "./finance.ts";

const order = (patch: Partial<Order>): Order => ({
  id: "o1", number: "PV-00001", customerName: "Cliente", channel: "direct", seller: "", items: [], status: "concluido", discount: 0, fees: 0, taxes: 0,
  shippingCharged: 0, shippingPaid: 0, advertisingCost: 0, otherCosts: 0, paymentMethod: "Pix", paymentStatus: "pendente", origin: "", addressSnapshot: "", note: "",
  gross: 100, netRevenue: 100, cost: 40, profit: 60, margin: 60, stockApplied: true, createdAt: "2026-10-05T15:00:00.000Z", completedAt: "2026-10-06T15:00:00.000Z", ...patch,
});

test("datas: meses curtos e parcelas com centavos exatos", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2026-12-10", 1), "2027-01-10");
  assert.deepEqual(splitAmount(100, 3), [33.33, 33.33, 33.34]);
});

test("recebimento parcial e quitação", () => {
  let s: AppState = { ...emptyState, orders: [order({})], payments: [{ id: "p1", orderId: "o1", expected: 100, received: 0, dueDate: "2026-10-06", method: "Pix", status: "pendente" }] };
  s = receivePayment(s, "p1", { amount: 40, date: "2026-10-07", method: "Pix" });
  assert.equal(s.payments[0].status, "parcial");
  assert.equal(s.payments[0].received, 40);
  assert.equal(s.orders[0].paymentStatus, "parcial");
  assert.throws(() => receivePayment(s, "p1", { amount: 70, date: "2026-10-08", method: "Pix" }), /saldo/);
  s = receivePayment(s, "p1", { amount: 60, date: "2026-10-09", method: "Cartão" });
  assert.equal(s.payments[0].status, "pago");
  assert.equal(s.payments[0].receipts?.length, 2);
  assert.throws(() => receivePayment(s, "p1", { amount: 1, date: "2026-10-09", method: "Pix" }), /quitado/);
});

test("marketplace: a receber é o repasse sem taxas, no prazo configurado", () => {
  const r = expectedReceivable(order({ channel: "shopee", netRevenue: 100, fees: 24, createdAt: "2026-10-05T15:00:00.000Z" }), defaults);
  assert.equal(r.expected, 76);
  assert.equal(r.dueDate, "2026-10-20");
});

test("despesa recorrente gera a do mês seguinte ao ser paga, uma vez só", () => {
  let s = createExpenses(emptyState, { description: "Aluguel", category: "Aluguel", amount: 650, dueDate: "2026-10-10", recurring: true, note: "" });
  s = payExpense(s, s.expenses[0].id, { date: "2026-10-09" });
  assert.equal(s.expenses.length, 2);
  assert.equal(s.expenses[1].dueDate, "2026-11-10");
  assert.equal(s.expenses[1].status, "pendente");
  assert.equal(s.expenses[0].seriesId, s.expenses[1].seriesId);
  s = cancelExpense(s, s.expenses[1].id);
  assert.equal(s.expenses[1].status, "cancelado");
  assert.throws(() => cancelExpense(s, s.expenses[0].id), /aberto/);
});

test("parcelamento cria contas mensais", () => {
  const s = createExpenses(emptyState, { description: "Impressora nova", category: "Ferramentas", amount: 3000, dueDate: "2026-10-15", recurring: false, note: "", installments: 3 });
  assert.deepEqual(s.expenses.map((e) => [e.description, e.amount, e.dueDate]), [["Impressora nova (1/3)", 1000, "2026-10-15"], ["Impressora nova (2/3)", 1000, "2026-11-15"], ["Impressora nova (3/3)", 1000, "2026-12-15"]]);
});

test("compra de filamento vira conta a pagar e estorno cancela as parcelas em aberto", () => {
  const purchase = { id: "pu1", materialId: "m1", kg: 2, subtotal: 180, freight: 20, total: 200, date: "2026-10-03", note: "" };
  const paid = purchaseExpenses(purchase, "PLA Preto", { mode: "paid" });
  assert.equal(paid[0].status, "pago");
  assert.equal(paid[0].paidAt, "2026-10-03");
  const split = purchaseExpenses(purchase, "PLA Preto", { mode: "installments", installments: 2, dueDate: "2026-11-03" });
  assert.deepEqual(split.map((e) => [e.amount, e.dueDate, e.status]), [[100, "2026-11-03", "pendente"], [100, "2026-12-03", "pendente"]]);
  let s: AppState = { ...emptyState, materials: [{ id: "m1", brand: "A", type: "PLA", color: "Preto", unit: "kg", location: "", stockGrams: 2000, averageCost: 100, minimumGrams: 100, status: "active" }], purchases: [purchase], expenses: split };
  s = { ...s, expenses: s.expenses.map((e, i) => (i === 0 ? { ...e, status: "pago" as const, paidAt: "2026-11-03" } : e)) };
  s = reversePurchase(s, "pu1", "Fornecedor errado");
  assert.deepEqual(s.expenses.map((e) => e.status), ["pago", "cancelado"]);
});

test("extrato: entradas, saídas, registros antigos e saldo inicial", () => {
  const s: AppState = {
    ...emptyState,
    orders: [order({ shippingPaid: 15, advertisingCost: 5 })],
    payments: [{ id: "p1", orderId: "o1", expected: 100, received: 100, dueDate: "2026-10-06", receivedAt: "2026-10-06T18:00:00.000Z", method: "Pix", status: "pago" }],
    purchases: [{ id: "old", materialId: "m1", kg: 1, subtotal: 90, freight: 0, total: 90, date: "2026-09-20", note: "" }],
    maintenances: [{ id: "mt1", machineId: "x", kind: "corretiva", cost: 50, date: "2026-10-12", machineHours: 100, note: "" }],
    expenses: [maintenanceExpense({ id: "mt1", machineId: "x", kind: "corretiva", cost: 50, date: "2026-10-12", machineHours: 100, note: "" })],
  };
  const october = cashLedger(s, "2026-10");
  const total = (kind: "in" | "out") => october.filter((e) => e.kind === kind).reduce((a, e) => a + e.amount, 0);
  assert.equal(total("in"), 100);
  assert.equal(total("out"), 70, "frete 15 + anúncio 5 + manutenção 50, sem duplicar a manutenção");
  assert.equal(openingBalance(s, "2026-10"), -90, "compra antiga sem conta vinculada sai do caixa em setembro");
  assert.equal(openingBalance({ ...s, settings: { ...defaults, openingCash: 1000 } }, "2026-10"), 910, "saldo inicial informado nos Parâmetros");
});

test("DRE: compras de filamento, manutenção e impostos ficam fora das despesas", () => {
  let s: AppState = { ...emptyState, orders: [order({ gross: 120, netRevenue: 110, fees: 10, taxes: 5, cost: 40, shippingPaid: 5, profit: 50 })] };
  s = createExpenses(s, { description: "Aluguel", category: "Aluguel", amount: 30, dueDate: "2026-10-10", recurring: false, note: "" });
  s = createExpenses(s, { description: "DAS", category: "Impostos", amount: 7, dueDate: "2026-10-20", recurring: false, note: "" });
  s = { ...s, expenses: [...s.expenses, ...purchaseExpenses({ id: "pu1", materialId: "m1", kg: 1, subtotal: 90, freight: 0, total: 90, date: "2026-10-03", note: "" }, "PLA", { mode: "paid" })] };
  const dre = monthlyDre(s, "2026-10");
  assert.equal(dre.net, 110);
  assert.equal(dre.contribution, 50);
  assert.equal(dre.opex, 30);
  assert.equal(dre.result, 20);
  assert.equal(dre.lines.find((l) => l.key === "discounts")?.value, -10);
});

test("resumo de contas: vencidas, da semana e próximos 30 dias", () => {
  let s = createExpenses(emptyState, { description: "Vencida", category: "Outros", amount: 10, dueDate: "2026-10-01", recurring: false, note: "" });
  s = createExpenses(s, { description: "Semana", category: "Outros", amount: 20, dueDate: "2026-10-25", recurring: false, note: "" });
  s = { ...s, payments: [{ id: "p1", orderId: "o1", expected: 100, received: 30, dueDate: "2026-10-30", method: "Pix", status: "parcial" }] };
  const r = accountsSummary(s, "2026-10-23");
  assert.equal(r.payableOverdue.length, 1);
  assert.equal(r.payableWeek.length, 1);
  assert.equal(r.receivable, 70);
  assert.equal(r.next30Out, 30);
  assert.equal(r.next30In, 70);
});

test("lucro do painel no mês é o mesmo do resultado do Financeiro", async () => {
  const { buildDashboardAnalytics } = await import("./dashboard.ts");
  let s: AppState = { ...emptyState, orders: [order({ gross: 300, netRevenue: 300, cost: 100, profit: 200, completedAt: "2026-10-06T15:00:00.000Z" })] };
  s = createExpenses(s, { description: "Aluguel", category: "Aluguel", amount: 80, dueDate: "2026-10-28", recurring: false, note: "" });
  s = createExpenses(s, { description: "DAS", category: "Impostos", amount: 9, dueDate: "2026-10-20", recurring: false, note: "" });
  s = { ...s, expenses: [...s.expenses, maintenanceExpense({ id: "mt", machineId: "x", kind: "preventiva", cost: 40, date: "2026-10-02", machineHours: 1, note: "" })] };
  const panel = buildDashboardAnalytics(s, { period: "month" }, new Date("2026-10-15T15:00:00.000Z"));
  assert.equal(monthlyDre(s, "2026-10").result, 120);
  assert.equal(Math.round(panel.operatingProfit * 100) / 100, 120);
});
