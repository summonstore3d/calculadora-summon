// Lista de reabastecimento: o que comprar, quanto e de quem, para filamento e outros insumos.
//
// Necessidade = estoque mínimo + o que as ordens de produção abertas vão consumir + o consumo médio
// dos últimos 30 dias pelos dias de cobertura escolhidos − o estoque atual.
// Filamento é arredondado para cima em kg inteiros (rolos); outros insumos, em unidades inteiras.
import { cents, type AppState } from "./summon.ts";

export type RestockItem = {
  kind: "material" | "supply";
  id: string;
  name: string;
  detail: string;
  unit: string;
  stock: number;
  minimum: number;
  planned: number;
  dailyUse: number;
  daysLeft: number | null;
  suggested: number;
  unitPrice: number;
  estimatedCost: number;
  supplierId?: string;
  urgency: "critical" | "soon";
  reason: string;
};

export type RestockGroup = { supplierId?: string; supplierName: string; contact: string; items: RestockItem[]; total: number };

const DAY = 86_400_000;
const ACTIVE = (status: string) => status !== "concluida" && status !== "cancelada";

export function restockPlan(state: AppState, reference = new Date(), coverDays = state.settings.restockCoverDays ?? 15) {
  const since = reference.getTime() - 30 * DAY;
  const usage = (entity: "material" | "supply", id: string) =>
    state.movements
      .filter(
        (m) =>
          m.entity === entity &&
          m.entityId === id &&
          m.kind === "production-consumption" &&
          new Date(m.createdAt).getTime() >= since,
      )
      .reduce((sum, m) => sum - m.quantity, 0) / 30;
  const openOrders = state.productionOrders.filter((o) => ACTIVE(o.status));
  const items: RestockItem[] = [];

  for (const m of state.materials) {
    if (m.status !== "active") continue;
    const plannedG = openOrders
      .flatMap((o) => o.plannedConsumption)
      .filter((p) => p.materialId === m.id)
      .reduce((sum, p) => sum + p.weightGrams, 0);
    const dailyG = usage("material", m.id),
      targetG = m.minimumGrams + plannedG + dailyG * coverDays,
      needG = targetG - m.stockGrams;
    if (needG <= 0.5) continue;
    const lastPurchase = state.purchases
      .filter((p) => p.materialId === m.id && !p.reversedAt && p.kg > 0)
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    const unitPrice = cents(lastPurchase ? lastPurchase.total / lastPurchase.kg : m.averageCost),
      suggested = Math.max(1, Math.ceil(needG / 1000));
    const daysLeft = dailyG > 0 ? Math.max(0, Math.floor((m.stockGrams - plannedG) / dailyG)) : null;
    const critical = m.stockGrams < plannedG || m.stockGrams <= m.minimumGrams;
    items.push({
      kind: "material",
      id: m.id,
      name: `${m.type} ${m.color}`,
      detail: m.brand,
      unit: "kg",
      stock: cents(m.stockGrams / 1000),
      minimum: cents(m.minimumGrams / 1000),
      planned: cents(plannedG / 1000),
      dailyUse: Math.round(dailyG) / 1000,
      daysLeft,
      suggested,
      unitPrice,
      estimatedCost: cents(suggested * unitPrice),
      supplierId: m.supplierId,
      urgency: critical ? "critical" : "soon",
      reason:
        m.stockGrams < plannedG
          ? "Falta para a produção aberta"
          : m.stockGrams <= m.minimumGrams
            ? "Abaixo do mínimo"
            : `Acaba em cerca de ${daysLeft} dias`,
    });
  }

  for (const x of state.supplies || []) {
    if (x.status !== "active") continue;
    const planned = openOrders.reduce((sum, o) => {
      const recipe = state.recipes.find((r) => r.id === o.recipeVersionId);
      return (
        sum +
        (recipe?.components || []).filter((c) => c.supplyId === x.id).reduce((a, c) => a + c.quantity * o.plannedQuantity, 0)
      );
    }, 0);
    const daily = usage("supply", x.id),
      need = x.minimum + planned + daily * coverDays - x.stock;
    if (need <= 0) continue;
    const lastPurchase = state.movements
      .filter((m) => m.entity === "supply" && m.entityId === x.id && m.kind === "purchase")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    const unitPrice = lastPurchase?.unitCost ?? x.averageCost,
      suggested = Math.ceil(need);
    const daysLeft = daily > 0 ? Math.max(0, Math.floor((x.stock - planned) / daily)) : null;
    const critical = x.stock < planned || x.stock <= x.minimum;
    items.push({
      kind: "supply",
      id: x.id,
      name: x.name,
      detail: "",
      unit: x.unit,
      stock: x.stock,
      minimum: x.minimum,
      planned: cents(planned),
      dailyUse: cents(daily),
      daysLeft,
      suggested,
      unitPrice,
      estimatedCost: cents(suggested * unitPrice),
      supplierId: x.supplierId,
      urgency: critical ? "critical" : "soon",
      reason:
        x.stock < planned
          ? "Falta para a produção aberta"
          : x.stock <= x.minimum
            ? "Abaixo do mínimo"
            : `Acaba em cerca de ${daysLeft} dias`,
    });
  }

  const order = { critical: 0, soon: 1 };
  items.sort((a, b) => order[a.urgency] - order[b.urgency] || a.name.localeCompare(b.name, "pt-BR"));
  const groups = new Map<string, RestockGroup>();
  for (const item of items) {
    const key = item.supplierId || "",
      supplier = state.suppliers.find((s) => s.id === item.supplierId);
    if (!groups.has(key))
      groups.set(key, {
        supplierId: item.supplierId,
        supplierName: supplier?.name || "Sem fornecedor definido",
        contact: [supplier?.contact, supplier?.email].filter(Boolean).join(" · "),
        items: [],
        total: 0,
      });
    const group = groups.get(key)!;
    group.items.push(item);
    group.total = cents(group.total + item.estimatedCost);
  }
  return {
    coverDays,
    items,
    groups: [...groups.values()].sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || b.total - a.total),
    total: cents(items.reduce((sum, i) => sum + i.estimatedCost, 0)),
  };
}

/** Texto pronto para mandar ao fornecedor (WhatsApp ou e-mail). */
export function restockMessage(group: Pick<RestockGroup, "items">, quantities: Record<string, number> = {}) {
  const lines = group.items
    .map((item) => ({ item, quantity: quantities[item.id] ?? item.suggested }))
    .filter(({ quantity }) => quantity > 0)
    .map(
      ({ item, quantity }) =>
        `- ${item.name}${item.detail ? ` (${item.detail})` : ""}: ${String(quantity).replace(".", ",")} ${item.unit}`,
    );
  return ["Olá! Gostaria de um orçamento para:", ...lines, "", "Obrigado!"].join("\n");
}
