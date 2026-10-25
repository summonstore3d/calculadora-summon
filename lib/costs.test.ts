import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProduction, calculateCost, channelNet, defaults, emptyState, machineSettings, priceDrift,
  recipeOther, saveRecipeVersion, type AppState, type RecipeVersion,
} from "./summon.ts";

const part = { materialId: "m1", name: "PLA Preto", weightGrams: 100, costPerKg: 100 };
const base = { parts: [part], hours: 4, manualHours: 0.25, wastePercent: 8, failurePercent: 5, other: 0, unitsPerPrint: 1 };

test("lucro e margem descontam imposto e taxas de cada canal", () => {
  const settings = { ...defaults, taxRate: 6 };
  const s = calculateCost(base, settings);
  // Antes: lucro exibido = preço − custo, ignorando o imposto.
  assert.equal(s.directProfit, Math.round((s.directPrice * 0.94 - s.unitCost) * 100) / 100);
  assert.ok(s.directProfit < s.directPrice - s.unitCost);
  const shopee = channelNet(s, s.shopeePrice, "shopee");
  assert.equal(s.shopeeProfit, shopee.profit);
  assert.equal(shopee.fees, Math.round((s.shopeePrice * 0.2 + 4) * 100) / 100);
  // O preço de cada canal entrega pelo menos o markup sobre o custo, já líquido.
  for (const profit of [s.directProfit, s.shopeeProfit!, s.mlProfit!]) assert.ok(profit >= s.unitCost * 0.8 - 0.02);
});

test("reserva de falha cobre só a impressão, não acabamento nem embalagem", () => {
  const settings = { ...defaults, packagingCost: 2 };
  const without = calculateCost({ ...base, failurePercent: 10 }, settings);
  const withFinishing = calculateCost({ ...base, failurePercent: 10, finishingMinutes: 30 }, settings);
  assert.equal(withFinishing.failure, without.failure);
  assert.equal(withFinishing.labor, Math.round((without.labor + 12.5) * 100) / 100);
  const printOnly = without.material + without.energy + without.depreciation + without.maintenance + 0.25 * defaults.manualHourRate;
  assert.ok(Math.abs(without.failure - printOnly * 0.1) < 0.02);
});

test("acabamento é por peça; preparo é por impressão", () => {
  const one = calculateCost({ ...base, unitsPerPrint: 1, finishingMinutes: 6 }, defaults);
  const ten = calculateCost({ ...base, unitsPerPrint: 10, finishingMinutes: 6 }, defaults);
  // 10 peças × 6 min = 1 h de acabamento + 0,25 h de preparo
  assert.equal(ten.labor, Math.round((1.25 * defaults.manualHourRate) * 100) / 100);
  assert.equal(one.labor, Math.round((0.35 * defaults.manualHourRate) * 100) / 100);
});

test("impressora escolhida muda energia e depreciação", () => {
  const machine = { powerKw: 0.3, acquisitionValue: 9000, lifeHours: 3000 };
  const s = calculateCost(base, machineSettings(defaults, machine));
  assert.equal(s.energy, Math.round(4 * 0.3 * defaults.energyRate * 100) / 100);
  assert.equal(s.depreciation, 12);
});

function fixture(): AppState {
  const snapshot = calculateCost({ parts: [part], hours: 2, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 3, unitsPerPrint: 4 }, { ...defaults, packagingCost: 1 });
  const recipe: RecipeVersion = { id: "r1", productId: "p1", version: 1, parts: [part], wastePercent: 0, failurePercent: 0, printHours: 2, manualHours: 0, unitsPerPrint: 4, snapshot, createdAt: "2026-01-01T00:00:00Z" };
  return {
    ...emptyState,
    settings: { ...defaults, packagingCost: 1 },
    materials: [{ id: "m1", brand: "A", type: "PLA", color: "Preto", unit: "kg", location: "", stockGrams: 5000, averageCost: 100, minimumGrams: 100, status: "active" }],
    products: [{ id: "p1", sku: "P1", name: "Peça", description: "", category: "T", universe: "", tags: [], dimensions: "", leadDays: 1, minimumStock: 0, fulfillment: "ready", status: "active", activeRecipeId: "r1", readyStock: 0, snapshot, createdAt: "2026-01-01T00:00:00Z" }],
    recipes: [recipe],
    productionOrders: [{ id: "op1", number: "OP-1", productId: "p1", recipeVersionId: "r1", plannedQuantity: 8, approvedQuantity: 0, lostQuantity: 0, priority: "normal", status: "imprimindo", plannedConsumption: [], actualConsumption: [], actualHours: 0, lossReason: "", note: "", createdAt: "2026-01-01T00:00:00Z" }],
  };
}

test("produção não conta embalagem duas vezes e escala outros custos por impressão", () => {
  const state = fixture();
  assert.equal(recipeOther(state.recipes[0]), 3, "ficha antiga: outros sem a embalagem");
  const next = buildProduction(state, "op1", { approved: 8, lost: 0, hours: 4, lossReason: "", note: "" });
  // 2 impressões × R$ 3 de outros + 8 peças × R$ 1 de embalagem = R$ 14
  assert.equal(next.lots[0].costBreakdown?.other, 14);
});

test("nova versão da ficha atualiza custo e preço do produto e guarda o histórico", () => {
  const state = fixture();
  const next = saveRecipeVersion(state, "p1", { parts: [{ ...part, weightGrams: 150 }], printHours: 3, manualHours: 0.2, finishingMinutes: 5, wastePercent: 3, failurePercent: 4, otherCost: 3, unitsPerPrint: 4, markup: 100 });
  assert.equal(next.recipes.length, 2);
  const product = next.products[0], recipe = next.recipes[1];
  assert.equal(recipe.version, 2);
  assert.equal(product.activeRecipeId, recipe.id);
  assert.equal(product.snapshot, recipe.snapshot);
  assert.ok(product.snapshot.unitCost > state.products[0].snapshot.unitCost);
  assert.equal(product.snapshot.settings.markup, 100);
  assert.throws(() => saveRecipeVersion(state, "p1", { parts: [], printHours: 1, manualHours: 0, finishingMinutes: 0, wastePercent: 0, failurePercent: 0, otherCost: 0, unitsPerPrint: 1, markup: 80 }), /material/);
});

test("preço desatualizado é detectado quando o custo médio do filamento muda", () => {
  let state = fixture();
  state = saveRecipeVersion(state, "p1", { parts: [part], printHours: 2, manualHours: 0, finishingMinutes: 0, wastePercent: 0, failurePercent: 0, otherCost: 3, unitsPerPrint: 4, markup: 80 });
  assert.equal(priceDrift(state, state.products[0])?.stale, false);
  state = { ...state, materials: state.materials.map((m) => ({ ...m, averageCost: 140 })) };
  const drift = priceDrift(state, state.products[0])!;
  assert.equal(drift.stale, true);
  assert.ok(drift.costChange > 5);
  assert.ok(drift.fresh.directPrice > drift.current.directPrice);
});
