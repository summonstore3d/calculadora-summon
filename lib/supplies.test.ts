import test from "node:test";
import assert from "node:assert/strict";
import { buildProduction, calculateCost, defaults, emptyState, priceDrift, saveRecipeVersion, type AppState } from "./summon.ts";
import { adjustSupplyStock, createSupply, registerSupplyPurchase } from "./operations.ts";
import { monthlyDre } from "./finance.ts";

const part = { materialId: "m1", name: "PLA Preto", weightGrams: 100, costPerKg: 100 };

function base(): AppState {
  let s: AppState = {
    ...emptyState,
    materials: [{ id: "m1", brand: "A", type: "PLA", color: "Preto", unit: "kg", location: "", stockGrams: 5000, averageCost: 100, minimumGrams: 100, status: "active" }],
  };
  s = createSupply(s, { name: "Ímã 10x3 mm", unit: "un", minimum: 50, stock: 100, averageCost: 0.25 }).state;
  const snapshot = calculateCost({ parts: [part], hours: 2, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 0 }, defaults);
  s = { ...s, products: [{ id: "p1", sku: "P1", name: "Porta-cartas", description: "", category: "T", universe: "", tags: [], dimensions: "", leadDays: 1, minimumStock: 0, fulfillment: "ready", status: "active", activeRecipeId: "r1", readyStock: 0, snapshot, createdAt: "2026-01-01T00:00:00Z" }],
    recipes: [{ id: "r1", productId: "p1", version: 1, parts: [part], wastePercent: 0, failurePercent: 0, printHours: 2, manualHours: 0, unitsPerPrint: 1, snapshot, createdAt: "2026-01-01T00:00:00Z" }] };
  return s;
}

test("cadastro com saldo inicial e custo médio na compra", () => {
  let s = base();
  assert.equal(s.supplies[0].stock, 100);
  assert.equal(s.movements.filter((m) => m.entity === "supply").length, 1);
  const r = registerSupplyPurchase(s, s.supplies[0].id, { quantity: 100, subtotal: 35, payment: { mode: "paid" } });
  s = r.state;
  assert.equal(s.supplies[0].stock, 200);
  assert.equal(s.supplies[0].averageCost, 0.3, "(100 × 0,25 + 35) / 200");
  assert.equal(r.payables[0].category, "Compra de insumos");
  assert.equal(monthlyDre(s, r.payables[0].dueDate.slice(0, 7)).opex, 0, "compra de insumo é estoque, não despesa do mês");
  assert.throws(() => createSupply(s, { name: "ímã 10x3 MM", unit: "un", minimum: 0 }), /mesmo nome|Já existe/);
});

test("componente por peça entra no custo, mas não na reserva de falha", () => {
  const withComponents = calculateCost({ parts: [part], hours: 2, manualHours: 0, wastePercent: 0, failurePercent: 10, other: 0, unitsPerPrint: 4, componentsPerUnit: 0.5 }, defaults);
  const without = calculateCost({ parts: [part], hours: 2, manualHours: 0, wastePercent: 0, failurePercent: 10, other: 0, unitsPerPrint: 4 }, defaults);
  assert.equal(withComponents.components, 2, "4 peças × R$ 0,50");
  assert.equal(withComponents.failure, without.failure);
  assert.equal(Math.round((withComponents.total - without.total) * 100) / 100, 2);
});

test("ficha com componentes: custo, aviso de preço e baixa na produção", () => {
  let s = base();
  const supplyId = s.supplies[0].id;
  s = saveRecipeVersion(s, "p1", { parts: [part], printHours: 2, manualHours: 0, finishingMinutes: 0, wastePercent: 0, failurePercent: 0, otherCost: 0, unitsPerPrint: 1, markup: 80, components: [{ supplyId, name: "", quantity: 4, unitCost: 0 }] });
  const recipe = s.recipes.at(-1)!;
  assert.equal(recipe.components?.[0].unitCost, 0.25);
  assert.equal(recipe.snapshot.components, 1);
  // Ímã ficou mais caro: o preço do produto fica desatualizado
  const dearer = { ...s, supplies: s.supplies.map((x) => ({ ...x, averageCost: 0.6 })) };
  assert.equal(priceDrift(dearer, dearer.products[0])?.stale, true);
  // Produção de 3 aprovadas + 1 perdida usa 12 ímãs (perdas não recebem componente)
  s = { ...s, productionOrders: [{ id: "op1", number: "OP-1", productId: "p1", recipeVersionId: recipe.id, plannedQuantity: 4, approvedQuantity: 0, lostQuantity: 0, priority: "normal", status: "imprimindo", plannedConsumption: [], actualConsumption: [], actualHours: 0, lossReason: "", note: "", createdAt: "2026-01-01T00:00:00Z" }] };
  const done = buildProduction(s, "op1", { approved: 3, lost: 1, hours: 8, lossReason: "Descolou", note: "" });
  assert.equal(done.supplies[0].stock, 88);
  assert.equal(done.lots[0].costBreakdown?.components, 3);
  assert.ok(done.movements.some((m) => m.entity === "supply" && m.kind === "production-consumption" && m.quantity === -12));
  const short = { ...s, supplies: s.supplies.map((x) => ({ ...x, stock: 5 })) };
  assert.throws(() => buildProduction(short, "op1", { approved: 3, lost: 0, hours: 6, lossReason: "", note: "" }), /insuficiente de Ímã/);
});

test("ajuste de estoque exige motivo e não deixa negativo", () => {
  const s = base(), id = s.supplies[0].id;
  assert.equal(adjustSupplyStock(s, id, { operation: "set", quantity: 80, reason: "Contagem" }).supplies[0].stock, 80);
  assert.throws(() => adjustSupplyStock(s, id, { operation: "remove", quantity: 500, reason: "Erro" }), /negativo/);
  assert.throws(() => adjustSupplyStock(s, id, { operation: "add", quantity: 1, reason: " " }), /motivo/);
});
