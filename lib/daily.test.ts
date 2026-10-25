import test from "node:test";
import assert from "node:assert/strict";
import { calculateCost, defaults, emptyState, type AppState } from "./summon.ts";
import { createOrder } from "./operations.ts";
import { dailySummary, dailyText } from "./daily.ts";

const now = new Date("2026-10-24T15:00:00.000Z");
const snapshot = calculateCost({ parts: [], hours: 1, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 10 }, defaults);
const expense = (id: string, dueDate: string, amount: number, status: "pendente" | "pago" = "pendente") => ({
  id,
  description: `Conta ${id}`,
  category: "Aluguel",
  amount,
  dueDate,
  recurring: false,
  status,
  note: "",
  createdAt: "2026-10-01T00:00:00Z",
});
function base(): AppState {
  return {
    ...emptyState,
    settings: { ...defaults, quoteValidityDays: 7 },
    materials: [
      {
        id: "m1",
        brand: "A",
        type: "PLA",
        color: "Preto",
        unit: "kg",
        location: "",
        stockGrams: 200,
        averageCost: 100,
        minimumGrams: 500,
        status: "active",
      },
    ],
    products: [
      {
        id: "p1",
        sku: "P1",
        name: "Deckbox",
        description: "",
        category: "T",
        universe: "",
        tags: [],
        dimensions: "",
        leadDays: 3,
        minimumStock: 4,
        fulfillment: "ready",
        status: "active",
        activeRecipeId: "",
        readyStock: 1,
        snapshot,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
    expenses: [
      expense("a", "2026-10-20", 100),
      expense("b", "2026-10-24", 50),
      expense("c", "2026-10-26", 30),
      expense("d", "2026-11-30", 999),
      expense("e", "2026-10-01", 10, "pago"),
    ] as any,
  };
}

test("contas atrasadas, de hoje e dos próximos 3 dias, com o total de cada grupo", () => {
  const s = dailySummary(base(), now);
  const by = Object.fromEntries(s.items.map((i) => [i.key, i]));
  assert.equal(by["contas-atrasadas"].amount, 100);
  assert.equal(by["contas-atrasadas"].tone, "danger");
  assert.equal(by["contas-hoje"].amount, 50);
  assert.equal(by["contas-proximas"].amount, 30);
  assert.equal(s.items[0].tone, "danger", "mais urgente primeiro");
});

test("estoque abaixo do mínimo, pedido parado e orçamento vencido", () => {
  let state = base();
  const approved = createOrder(
    state,
    { channel: "direct", customerName: "Ana", items: [{ productId: "p1", quantity: 1 }] },
    "2026-10-10T12:00:00.000Z",
  );
  state = { ...approved.state, orders: approved.state.orders.map((o) => ({ ...o, status: "aprovado" as const, history: [] })) };
  const quote = createOrder(
    state,
    { channel: "direct", customerName: "Bia", items: [{ productId: "p1", quantity: 1 }] },
    "2026-10-01T12:00:00.000Z",
  );
  state = quote.state;
  const s = dailySummary(state, now);
  const keys = s.items.map((i) => i.key);
  assert.ok(keys.includes("insumo-minimo"));
  assert.ok(keys.includes("produto-minimo"));
  const stalled = s.items.find((i) => i.key.startsWith("pedido-parado"))!;
  assert.match(stalled.title, /parado há 14 dias/);
  assert.equal(stalled.record, approved.order.number);
  assert.ok(keys.includes("orcamentos-vencidos"));
});

test("sem nada pendente, o resumo fica vazio e o texto diz isso", () => {
  const empty = dailySummary({ ...emptyState }, now);
  assert.equal(empty.items.length, 0);
  assert.match(dailyText(empty), /Nada pedindo atenção/);
  assert.match(dailyText(dailySummary(base(), now), "Oficina"), /Oficina · 24\/10\/2026[\s\S]*conta atrasada/);
});
