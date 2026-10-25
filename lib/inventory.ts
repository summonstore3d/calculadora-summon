// Inventário: contar o estoque físico e corrigir todas as diferenças de uma vez.
//
// - Filamento é contado em gramas (peso do rolo sem o carretel vazio).
// - Outros insumos, na unidade de cada um.
// - Peças prontas, em unidades. Falta sai dos lotes mais antigos primeiro (mesma ordem da venda);
//   sobra entra num lote de ajuste ao custo atual do produto, porque um lote nunca pode passar da
//   quantidade produzida.
// Cada correção vira uma movimentação "inventory-adjustment" com o motivo, como os ajustes avulsos.
import { adjustSupplyStock } from "./operations.ts";
import {
  adjustProductStock,
  cents,
  localDay,
  nextSequence,
  uid,
  type AppState,
  type Movement,
  type ProductLot,
} from "./summon.ts";

export type InventoryKind = "material" | "supply" | "product";
export type InventoryLine = {
  key: string;
  kind: InventoryKind;
  id: string;
  name: string;
  detail: string;
  unit: string;
  system: number;
  /** Valor de uma unidade da linha (por grama no filamento). */
  unitValue: number;
};
export type InventoryCounts = Record<string, number | undefined>;

export const inventoryKey = (kind: InventoryKind, id: string) => `${kind}:${id}`;

/** Tudo que pode ser contado: itens ativos e os arquivados que ainda têm saldo. */
export function inventoryLines(state: AppState): InventoryLine[] {
  const materials = state.materials
    .filter((m) => m.status === "active" || m.stockGrams > 0)
    .map((m) => ({
      key: inventoryKey("material", m.id),
      kind: "material" as const,
      id: m.id,
      name: `${m.type} ${m.color}`,
      detail: [m.brand, m.location].filter(Boolean).join(" · "),
      unit: "g",
      system: cents(m.stockGrams),
      unitValue: m.averageCost / 1000,
    }));
  const supplies = (state.supplies || [])
    .filter((x) => x.status === "active" || x.stock > 0)
    .map((x) => ({
      key: inventoryKey("supply", x.id),
      kind: "supply" as const,
      id: x.id,
      name: x.name,
      detail: x.location || "",
      unit: x.unit,
      system: x.stock,
      unitValue: x.averageCost,
    }));
  const products = state.products
    .filter((p) => p.status !== "archived" || p.readyStock > 0)
    .filter((p) => p.fulfillment !== "made-to-order" || p.readyStock > 0)
    .map((p) => {
      const lots = state.lots.filter((l) => l.productId === p.id && l.balance > 0),
        units = lots.reduce((a, l) => a + l.balance, 0),
        value = lots.reduce((a, l) => a + l.balance * l.unitCost, 0);
      return {
        key: inventoryKey("product", p.id),
        kind: "product" as const,
        id: p.id,
        name: p.name,
        detail: p.sku,
        unit: "un",
        system: p.readyStock,
        unitValue: units ? value / units : p.snapshot.unitCost,
      };
    });
  const byName = (a: InventoryLine, b: InventoryLine) => a.name.localeCompare(b.name, "pt-BR");
  return [...materials.sort(byName), ...supplies.sort(byName), ...products.sort(byName)];
}

/** Diferenças entre o contado e o sistema. Linha sem contagem fica de fora. */
export function inventoryDiff(state: AppState, counts: InventoryCounts) {
  const lines = inventoryLines(state)
    .filter((line) => counts[line.key] !== undefined && Number.isFinite(counts[line.key]))
    .map((line) => {
      const counted =
        line.kind === "material"
          ? cents(counts[line.key]!)
          : line.kind === "product"
            ? Math.trunc(counts[line.key]!)
            : cents(counts[line.key]!);
      const diff = cents(counted - line.system);
      return { ...line, counted, diff, valueDiff: cents(diff * line.unitValue) };
    });
  const changed = lines.filter((line) => line.diff !== 0);
  return {
    counted: lines.length,
    lines,
    changed,
    loss: cents(changed.filter((l) => l.valueDiff < 0).reduce((a, l) => a - l.valueDiff, 0)),
    gain: cents(changed.filter((l) => l.valueDiff > 0).reduce((a, l) => a + l.valueDiff, 0)),
    net: cents(changed.reduce((a, l) => a + l.valueDiff, 0)),
  };
}

/** Aplica todas as diferenças. Nada é gravado se alguma linha for inválida. */
export function applyInventory(state: AppState, counts: InventoryCounts, reason: string, now = new Date().toISOString()) {
  const text = reason.trim();
  if (!text) throw new Error("Informe o motivo do inventário");
  const result = inventoryDiff(state, counts);
  for (const line of result.lines) if (line.counted < 0) throw new Error(`A contagem de ${line.name} não pode ser negativa`);
  const [y, m, d] = localDay(now).split("-"),
    note = `Inventário ${d}/${m}/${y}: ${text}`;
  let next = state;
  for (const line of result.changed) {
    if (line.kind === "material") {
      const material = next.materials.find((x) => x.id === line.id)!;
      const movement: Movement = {
        id: uid(),
        entity: "material",
        entityId: material.id,
        kind: "inventory-adjustment",
        quantity: cents(line.counted - material.stockGrams),
        balanceAfter: line.counted,
        unitCost: material.averageCost,
        note,
        createdAt: now,
      };
      next = {
        ...next,
        materials: next.materials.map((x) => (x.id === material.id ? { ...x, stockGrams: line.counted } : x)),
        movements: [...next.movements, movement],
      };
    } else if (line.kind === "supply") {
      next = adjustSupplyStock(next, line.id, { operation: "set", quantity: line.counted, reason: note }, now);
    } else if (line.diff < 0) {
      let missing = -line.diff;
      const lots = next.lots
        .filter((l) => l.productId === line.id && l.balance > 0)
        .sort((a, b) => a.producedAt.localeCompare(b.producedAt));
      for (const lot of lots) {
        if (!missing) break;
        const take = Math.min(missing, lot.balance);
        next = adjustProductStock(next, lot.id, { operation: "remove", quantity: take, reason: note });
        missing -= take;
      }
      if (missing)
        throw new Error(`Os lotes de ${line.name} não cobrem a diferença. Confira o estoque de produtos antes do inventário.`);
    } else {
      const product = next.products.find((p) => p.id === line.id)!,
        quantity = line.diff,
        readyStock = product.readyStock + quantity;
      const lot: ProductLot = {
        id: uid(),
        code: nextSequence(
          next.lots.map((l) => l.code),
          `AJ-${localDay(now).replaceAll("-", "")}-`,
          1,
        ),
        productId: product.id,
        productionOrderId: "inventario",
        recipeVersionId: product.activeRecipeId,
        initialQuantity: quantity,
        balance: quantity,
        unitCost: cents(line.unitValue),
        producedAt: now,
        note,
      };
      const movement: Movement = {
        id: uid(),
        entity: "product",
        entityId: product.id,
        kind: "inventory-adjustment",
        quantity,
        balanceAfter: readyStock,
        referenceId: lot.id,
        unitCost: lot.unitCost,
        note,
        createdAt: now,
      };
      next = {
        ...next,
        lots: [...next.lots, lot],
        products: next.products.map((p) => (p.id === product.id ? { ...p, readyStock } : p)),
        movements: [...next.movements, movement],
      };
    }
  }
  return { state: next, ...result };
}
