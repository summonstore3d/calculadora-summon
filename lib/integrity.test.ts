import test from "node:test";
import assert from "node:assert/strict";
import { calculateCost, defaults, emptyState, type AppState } from "./summon.ts";
import { integrityIssues, newIntegrityIssues } from "./integrity.ts";

const snapshot = calculateCost({ parts: [], hours: 1, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 0 }, defaults);
const state = (readyStock: number, balance: number): AppState => ({
  ...emptyState,
  products: [{ id: "p1", sku: "P1", name: "Vaso", description: "", category: "T", universe: "", tags: [], dimensions: "", leadDays: 1, minimumStock: 0, fulfillment: "ready", status: "active", activeRecipeId: "", readyStock, snapshot, createdAt: "2026-01-01T00:00:00Z" }],
  lots: [{ id: "l1", code: "LT-1", productId: "p1", productionOrderId: "op1", recipeVersionId: "r1", initialQuantity: 10, balance, unitCost: 5, producedAt: "2026-01-01T00:00:00Z", note: "" }],
});

test("detecta estoque do produto diferente da soma dos lotes", () => {
  assert.equal(integrityIssues(state(4, 4)).length, 0);
  assert.match(integrityIssues(state(5, 4))[0].message, /não bate/);
});

test("só bloqueia problema novo; o que já existia não impede gravar", () => {
  const broken = state(5, 4);
  assert.equal(newIntegrityIssues(broken, { ...broken, customers: [] }).length, 0, "dado antigo incoerente continua utilizável");
  assert.equal(newIntegrityIssues(state(4, 4), state(4, 3)).length, 1, "baixar lote sem baixar o produto é recusado");
});

test("detecta números repetidos e recebimento acima do valor", () => {
  const s: AppState = {
    ...emptyState,
    products: [...state(0, 0).products, { ...state(0, 0).products[0], id: "p2", sku: "p1" }],
    payments: [{ id: "pg", orderId: "o", expected: 50, received: 60, dueDate: "2026-10-01", method: "", status: "pago" }],
  };
  const keys = integrityIssues(s).map((i) => i.key.split(":")[0]);
  assert.ok(keys.includes("sku-duplicado"));
  assert.ok(keys.includes("recebimento-excedente"));
});
