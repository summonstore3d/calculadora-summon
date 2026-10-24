import test from "node:test";
import assert from "node:assert/strict";
import { calculateCost, defaults, emptyState, type AppState } from "./summon.ts";
import { createOrder, registerPurchase } from "./operations.ts";

const snapshot = calculateCost({ parts: [], hours: 1, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 10 }, defaults);
const base = (): AppState => ({
  ...emptyState,
  settings: { ...defaults, taxRate: 5 },
  materials: [{ id: "m1", brand: "A", type: "PLA", color: "Preto", unit: "kg", location: "", stockGrams: 1000, averageCost: 100, minimumGrams: 100, status: "active" }],
  products: [{ id: "p1", sku: "P1", name: "Peça", description: "", category: "T", universe: "", tags: [], dimensions: "", leadDays: 1, minimumStock: 0, fulfillment: "ready", status: "active", activeRecipeId: "", readyStock: 0, snapshot, createdAt: "2026-01-01T00:00:00Z" }],
});

test("pedido considera desconto por item no valor a receber e no imposto", () => {
  const { state, order } = createOrder(base(), { channel: "direct", items: [{ productId: "p1", quantity: 2, unitPrice: 50, discount: 10 }], discount: 5, shippingCharged: 12 });
  assert.equal(order.gross, 112);
  assert.equal(order.netRevenue, 97, "100 + 12 de frete − 5 geral − 10 do item");
  assert.equal(order.taxes, 4.25, "5% sobre 85");
  assert.equal(state.payments[0].expected, 97);
  assert.equal(order.number, "PV-00001");
  assert.equal(order.history?.[0].note, "Pedido criado");
});

test("pedido sem preço usa o preço do canal; marketplace a receber sem taxa", () => {
  const { state, order } = createOrder(base(), { channel: "shopee", items: [{ productId: "p1", quantity: 1 }] });
  assert.equal(order.items[0].unitPrice, snapshot.shopeePrice);
  assert.equal(state.payments[0].expected, Math.round((order.netRevenue - order.fees) * 100) / 100);
});

test("pedido recusa itens inválidos", () => {
  assert.throws(() => createOrder(base(), { channel: "direct", items: [] }), /ao menos um produto/);
  assert.throws(() => createOrder(base(), { channel: "direct", items: [{ productId: "p1", quantity: 1, unitPrice: 10, discount: 20 }] }), /desconto/);
});

test("compra soma estoque, recalcula custo médio e lança a conta", () => {
  const { state, payables } = registerPurchase(base(), "m1", { kg: 1, subtotal: 120, freight: 20, date: "2026-10-10", payment: { mode: "installments", installments: 2, dueDate: "2026-11-10" } });
  assert.equal(state.materials[0].stockGrams, 2000);
  assert.equal(state.materials[0].averageCost, 120, "(1 kg × 100 + 1 kg × 140) / 2 kg");
  assert.equal(payables.length, 2);
  assert.equal(state.expenses.length, 2);
  assert.equal(state.movements[0].quantity, 1000);
  assert.throws(() => registerPurchase(base(), "m1", { kg: 0, subtotal: 10, payment: { mode: "paid" } }), /peso/);
  assert.throws(() => registerPurchase(base(), "m1", { kg: 1, subtotal: 10, payment: { mode: "due" } }), /vencimento/);
});
