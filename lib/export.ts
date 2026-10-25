// Planilhas para o contador: CSV que o Excel em português abre direto (UTF-8 com BOM, ponto e vírgula,
// vírgula decimal, datas dd/mm/aaaa). Também abre no Google Sheets e no LibreOffice.
import { cashLedger, countsInResult, monthlyDre } from "./finance.ts";
import { cents, localDay, localMonth, type AppState } from "./summon.ts";

export type Cell = string | number | null | undefined;
export type Sheet = { filename: string; rows: Cell[][] };

const br = (value?: string) => {
  if (!value) return "";
  const [y, m, d] = localDay(value).split("-");
  return `${d}/${m}/${y}`;
};
const inMonth = (value: string | undefined, month: string) => !!value && localMonth(value) === month;
const CHANNEL: Record<string, string> = { direct: "Venda direta", shopee: "Shopee", ml: "Mercado Livre" };
const STATUS: Record<string, string> = {
  pendente: "Pendente",
  pago: "Paga",
  cancelado: "Cancelada",
  parcial: "Parcial",
  estornado: "Estornado",
};

/** Uma célula de CSV. Texto que começa com = + - @ ganha um apóstrofo, para o Excel não executar como fórmula. */
export function csvCell(value: Cell) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(cents(value)).replace(".", ",") : "";
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${text.replaceAll('"', '""')}"`;
}

export const toCsv = (rows: Cell[][]) => "﻿" + rows.map((row) => row.map(csvCell).join(";")).join("\r\n");

/** Vendas concluídas no mês, uma linha por item. */
export function salesSheet(state: AppState, month: string): Sheet {
  const rows: Cell[][] = [
    [
      "Data",
      "Pedido",
      "Cliente",
      "Canal",
      "Produto",
      "SKU",
      "Quantidade",
      "Preço unitário",
      "Desconto",
      "Receita",
      "Taxas",
      "Impostos",
      "Custo",
      "Lucro",
      "Margem (%)",
    ],
  ];
  const orders = state.orders
    .filter((o) => o.status === "concluido" && inMonth(o.completedAt || o.createdAt, month))
    .sort((a, b) => (a.completedAt || a.createdAt).localeCompare(b.completedAt || b.createdAt));
  for (const o of orders)
    for (const i of o.items)
      rows.push([
        br(o.completedAt || o.createdAt),
        o.number,
        o.customerName,
        CHANNEL[o.channel] || o.channel,
        i.productName,
        i.productSku,
        i.quantity,
        i.unitPrice,
        i.discount,
        i.revenue,
        i.fees,
        i.taxes,
        i.cost,
        i.profit,
        i.margin,
      ]);
  return { filename: `vendas-${month}.csv`, rows };
}

/** Resultado do mês (DRE), linha a linha. */
export function dreSheet(state: AppState, month: string): Sheet {
  const dre = monthlyDre(state, month);
  return {
    filename: `resultado-${month}.csv`,
    rows: [["Linha", "Valor"], ...dre.lines.map((l) => [l.label, l.value] as Cell[]), ["Margem líquida (%)", dre.margin]],
  };
}

/** Contas a pagar com vencimento no mês, de qualquer situação. */
export function expensesSheet(state: AppState, month: string): Sheet {
  const rows: Cell[][] = [
    ["Vencimento", "Descrição", "Categoria", "Valor", "Situação", "Pago em", "Parcela", "Entra no resultado", "Observação"],
  ];
  for (const e of state.expenses.filter((x) => inMonth(x.dueDate, month)).sort((a, b) => a.dueDate.localeCompare(b.dueDate)))
    rows.push([
      br(e.dueDate),
      e.description,
      e.category,
      e.amount,
      STATUS[e.status] || e.status,
      br(e.paidAt),
      e.installment ? `${e.installment.index}/${e.installment.total}` : "",
      countsInResult(e) ? "Sim" : "Não",
      e.note,
    ]);
  return { filename: `contas-${month}.csv`, rows };
}

/** Extrato do caixa: o que de fato entrou e saiu no mês. */
export function cashSheet(state: AppState, month: string): Sheet {
  const rows: Cell[][] = [["Data", "Tipo", "Categoria", "Descrição", "Entrada", "Saída"]];
  for (const e of cashLedger(state, month).sort((a, b) => a.date.localeCompare(b.date)))
    rows.push([
      br(e.date),
      e.kind === "in" ? "Entrada" : "Saída",
      e.category,
      e.description,
      e.kind === "in" ? e.amount : null,
      e.kind === "out" ? e.amount : null,
    ]);
  return { filename: `extrato-${month}.csv`, rows };
}

/** Estoque valorizado hoje: filamento, outros insumos e peças prontas. */
export function stockSheet(state: AppState, day = localDay(new Date())): Sheet {
  const rows: Cell[][] = [["Tipo", "Item", "Detalhe", "Quantidade", "Unidade", "Custo unitário", "Valor em estoque"]];
  for (const m of state.materials.filter((x) => x.stockGrams > 0 || x.status === "active"))
    rows.push([
      "Filamento",
      `${m.type} ${m.color}`,
      m.brand,
      cents(m.stockGrams / 1000),
      "kg",
      m.averageCost,
      cents((m.stockGrams / 1000) * m.averageCost),
    ]);
  for (const x of (state.supplies || []).filter((s) => s.stock > 0 || s.status === "active"))
    rows.push(["Outro insumo", x.name, x.location, x.stock, x.unit, x.averageCost, cents(x.stock * x.averageCost)]);
  for (const p of state.products) {
    const lots = state.lots.filter((l) => l.productId === p.id && l.balance > 0);
    if (!lots.length) continue;
    const units = lots.reduce((a, l) => a + l.balance, 0),
      value = cents(lots.reduce((a, l) => a + l.balance * l.unitCost, 0));
    rows.push(["Peça pronta", p.name, p.sku, units, "un", units ? cents(value / units) : 0, value]);
  }
  const total = cents(rows.slice(1).reduce((a, r) => a + Number(r[6] || 0), 0));
  rows.push([], ["", "Total", "", "", "", "", total]);
  return { filename: `estoque-${day}.csv`, rows };
}
