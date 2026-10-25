import test from "node:test";
import assert from "node:assert/strict";
import { calculateCost, defaults, emptyState, type AppState, type ProductLot } from "./summon.ts";
import { createSupply } from "./operations.ts";
import { applyInventory, inventoryDiff, inventoryKey, inventoryLines } from "./inventory.ts";
import { integrityIssues } from "./integrity.ts";

const snapshot = calculateCost({ parts: [], hours: 1, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 10 }, defaults);
const lot = (id: string, balance: number, producedAt: string, unitCost: number): ProductLot => ({
  id,
  code: `LT-${id}`,
  productId: "p1",
  productionOrderId: "op",
  recipeVersionId: "r1",
  initialQuantity: balance,
  balance,
  unitCost,
  producedAt,
  note: "",
});
function base(): AppState {
  let s: AppState = {
    ...emptyState,
    materials: [
      {
        id: "m1",
        brand: "Voolt",
        type: "PLA",
        color: "Preto",
        unit: "kg",
        location: "Prateleira A",
        stockGrams: 2500,
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
        leadDays: 1,
        minimumStock: 0,
        fulfillment: "ready",
        status: "active",
        activeRecipeId: "r1",
        readyStock: 5,
        snapshot,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ],
    lots: [lot("velho", 2, "2026-01-01T00:00:00Z", 10), lot("novo", 3, "2026-02-01T00:00:00Z", 20)],
  };
  s = createSupply(s, { name: "Ímã", unit: "un", minimum: 10, stock: 100, averageCost: 0.5 }).state;
  return s;
}

test("lista filamento, insumos e peças com o valor de cada unidade", () => {
  const lines = inventoryLines(base());
  assert.deepEqual(
    lines.map((l) => l.kind),
    ["material", "supply", "product"],
  );
  assert.equal(lines[0].unit, "g");
  assert.equal(lines[0].unitValue, 0.1, "R$ 100/kg = R$ 0,10/g");
  assert.equal(lines[2].unitValue, 16, "média ponderada dos lotes: (2×10 + 3×20) / 5");
});

test("diferenças só das linhas contadas, com perda e sobra em reais", () => {
  const s = base(),
    supply = s.supplies[0].id;
  const d = inventoryDiff(s, { [inventoryKey("material", "m1")]: 2300, [inventoryKey("supply", supply)]: 104 });
  assert.equal(d.counted, 2);
  assert.equal(d.changed.length, 2);
  assert.equal(d.loss, 20, "200 g × R$ 0,10");
  assert.equal(d.gain, 2, "4 ímãs × R$ 0,50");
  assert.equal(d.net, -18);
});

test("aplica tudo: falta sai do lote mais antigo, sobra vira lote de ajuste, e a conferência do servidor continua limpa", () => {
  const s = base(),
    supply = s.supplies[0].id;
  const r = applyInventory(
    s,
    { [inventoryKey("material", "m1")]: 2300, [inventoryKey("supply", supply)]: 100, [inventoryKey("product", "p1")]: 2 },
    "Contagem de outubro",
    "2026-10-24T15:00:00.000Z",
  );
  assert.equal(r.state.materials[0].stockGrams, 2300);
  assert.equal(r.state.supplies[0].stock, 100, "contado igual ao sistema não muda nada");
  assert.equal(r.state.products[0].readyStock, 2);
  assert.equal(r.state.lots.find((l) => l.id === "velho")!.balance, 0, "faltaram 3: os 2 do lote antigo saem primeiro");
  assert.equal(r.state.lots.find((l) => l.id === "novo")!.balance, 2);
  const notes = r.state.movements.filter((m) => m.kind === "inventory-adjustment").map((m) => m.note);
  assert.equal(notes.length, 3, "1 de filamento + 2 lotes");
  assert.ok(notes.every((n) => n === "Inventário 24/10/2026: Contagem de outubro"));
  assert.deepEqual(integrityIssues(r.state), []);

  const more = applyInventory(
    r.state,
    { [inventoryKey("product", "p1")]: 6 },
    "Achei caixa no depósito",
    "2026-10-25T15:00:00.000Z",
  );
  const adj = more.state.lots.find((l) => l.code.startsWith("AJ-"))!;
  assert.equal(adj.code, "AJ-20261025-1");
  assert.equal(adj.balance, 4);
  assert.equal(adj.unitCost, 20, "ao custo médio dos lotes que restaram");
  assert.equal(more.state.products[0].readyStock, 6);
  assert.deepEqual(integrityIssues(more.state), []);
});

test("recusa contagem negativa e motivo vazio, sem alterar nada", () => {
  const s = base();
  assert.throws(() => applyInventory(s, { [inventoryKey("material", "m1")]: -1 }, "x"), /negativa/);
  assert.throws(() => applyInventory(s, { [inventoryKey("material", "m1")]: 10 }, "  "), /motivo/);
  assert.equal(s.materials[0].stockGrams, 2500);
});
