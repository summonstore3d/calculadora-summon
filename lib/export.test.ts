import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, type AppState } from "./summon.ts";
import { csvCell, expensesSheet, stockSheet, toCsv } from "./export.ts";

test("CSV para o Excel em português: BOM, ponto e vírgula, vírgula decimal e proteção contra fórmula", () => {
  const csv = toCsv([
    ["Nome", "Valor"],
    ['Ana "Bia"', 12.5],
    ['=HYPERLINK("x")', -3],
  ]);
  assert.ok(csv.startsWith("﻿"));
  assert.equal(csv.split("\r\n")[1], '"Ana ""Bia""";12,5');
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("-5"), '"\'-5"');
  assert.equal(csvCell(null), "");
});

test("contas do mês com situação e se entram no resultado", () => {
  const state: AppState = {
    ...emptyState,
    expenses: [
      {
        id: "1",
        description: "Aluguel",
        category: "Aluguel",
        amount: 800,
        dueDate: "2026-10-05",
        paidAt: "2026-10-05",
        recurring: true,
        status: "pago",
        note: "",
        createdAt: "",
      },
      {
        id: "2",
        description: "PLA",
        category: "Compra de filamento",
        amount: 120,
        dueDate: "2026-10-10",
        recurring: false,
        status: "pendente",
        note: "",
        createdAt: "",
      },
      {
        id: "3",
        description: "Outro mês",
        category: "Aluguel",
        amount: 1,
        dueDate: "2026-11-05",
        recurring: false,
        status: "pendente",
        note: "",
        createdAt: "",
      },
    ],
  };
  const sheet = expensesSheet(state, "2026-10");
  assert.equal(sheet.rows.length, 3);
  assert.deepEqual(sheet.rows[1].slice(0, 6), ["05/10/2026", "Aluguel", "Aluguel", 800, "Paga", "05/10/2026"]);
  assert.equal(sheet.rows[2][7], "Não", "compra de filamento é estoque, não despesa do mês");
});

test("estoque valorizado soma filamento, insumos e peças", () => {
  const state: AppState = {
    ...emptyState,
    materials: [
      {
        id: "m",
        brand: "A",
        type: "PLA",
        color: "Preto",
        unit: "kg",
        location: "",
        stockGrams: 1500,
        averageCost: 100,
        minimumGrams: 0,
        status: "active",
      },
    ],
    supplies: [{ id: "s", name: "Ímã", unit: "un", stock: 10, averageCost: 0.5, minimum: 0, location: "", status: "active" }],
    products: [{ id: "p", sku: "P", name: "Deckbox", readyStock: 2 } as any],
    lots: [
      {
        id: "l",
        code: "L",
        productId: "p",
        productionOrderId: "",
        recipeVersionId: "",
        initialQuantity: 2,
        balance: 2,
        unitCost: 7.5,
        producedAt: "",
        note: "",
      },
    ],
  };
  const rows = stockSheet(state, "2026-10-24").rows;
  assert.equal(rows.at(-1)![6], 150 + 5 + 15);
});
