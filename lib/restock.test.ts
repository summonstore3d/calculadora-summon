import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type AppState } from "./summon.ts";
import { restockMessage, restockPlan } from "./restock.ts";

const now = new Date("2026-10-24T15:00:00.000Z");
const state = (): AppState => ({
  ...emptyState,
  suppliers: [{ id: "s1", name: "Filamentos Ltda", contact: "(11) 99999-0000", email: "", note: "", status: "active" }],
  materials: [
    { id: "preto", brand: "Voolt", type: "PLA", color: "Preto", unit: "kg", supplierId: "s1", location: "", stockGrams: 1200, averageCost: 90, minimumGrams: 500, status: "active" },
    { id: "branco", brand: "Voolt", type: "PLA", color: "Branco", unit: "kg", supplierId: "s1", location: "", stockGrams: 5000, averageCost: 90, minimumGrams: 500, status: "active" },
  ],
  supplies: [{ id: "ima", name: "Ímã 10x3", unit: "un", stock: 30, averageCost: 0.25, minimum: 50, location: "", status: "active" }],
  purchases: [{ id: "c1", materialId: "preto", kg: 2, subtotal: 200, freight: 20, total: 220, date: "2026-10-01", note: "" }],
  // 600 g de PLA Preto consumidos nos últimos 30 dias = 20 g/dia
  movements: [{ id: "mv", entity: "material", entityId: "preto", kind: "production-consumption", quantity: -600, balanceAfter: 1200, note: "", createdAt: "2026-10-10T12:00:00.000Z" }],
  productionOrders: [{ id: "op", number: "OP-1", productId: "p", recipeVersionId: "r", plannedQuantity: 2, approvedQuantity: 0, lostQuantity: 0, priority: "normal", status: "fila", plannedConsumption: [{ materialId: "preto", name: "PLA Preto", weightGrams: 400, costPerKg: 90 }], actualConsumption: [], actualHours: 0, lossReason: "", note: "", createdAt: "2026-10-20T12:00:00.000Z" }],
});

test("filamento: mínimo + produção aberta + consumo da cobertura − estoque, em kg inteiros", () => {
  const plan = restockPlan(state(), now, 15);
  const preto = plan.items.find((i) => i.id === "preto")!;
  // 500 + 400 + 20 × 15 − 1200 = 0 → não entra; com 30 dias: 500 + 400 + 600 − 1200 = 300 g → 1 kg
  assert.equal(preto, undefined);
  const longer = restockPlan(state(), now, 30).items.find((i) => i.id === "preto")!;
  assert.equal(longer.suggested, 1);
  assert.equal(longer.unitPrice, 110, "preço da última compra: 220 / 2 kg");
  assert.equal(longer.daysLeft, 40, "(1200 − 400) / 20");
  assert.equal(plan.items.some((i) => i.id === "branco"), false);
});

test("insumo abaixo do mínimo é crítico e o grupo sem fornecedor fica por último", () => {
  const plan = restockPlan(state(), now, 15);
  const ima = plan.items.find((i) => i.id === "ima")!;
  assert.equal(ima.urgency, "critical");
  assert.equal(ima.suggested, 20);
  assert.equal(plan.groups.at(-1)?.supplierName, "Sem fornecedor definido");
});

test("mensagem para o fornecedor usa as quantidades ajustadas", () => {
  const plan = restockPlan(state(), now, 30), group = plan.groups.find((g) => g.supplierId === "s1")!;
  const text = restockMessage(group, { preto: 3 });
  assert.match(text, /PLA Preto \(Voolt\): 3 kg/);
});
