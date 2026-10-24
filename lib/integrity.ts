// Conferência feita pelo servidor antes de gravar. A regra é "não piorar": um problema que já existia
// nos dados antigos não bloqueia o uso, mas uma gravação não pode criar um problema novo.
import { cents, normalize, type AppState } from "./summon.ts";
import { receiptsOf } from "./finance.ts";

export type Issue = { key: string; message: string };

export function integrityIssues(state: AppState): Issue[] {
  const issues: Issue[] = [];
  const lotsByProduct = new Map<string, number>();
  for (const lot of state.lots) lotsByProduct.set(lot.productId, (lotsByProduct.get(lot.productId) || 0) + lot.balance);
  for (const product of state.products) {
    const lots = lotsByProduct.get(product.id);
    if (lots !== undefined && lots !== product.readyStock)
      issues.push({
        key: `estoque-produto:${product.id}`,
        message: `O estoque de ${product.name} (${product.readyStock} un) não bate com a soma dos lotes (${lots} un).`,
      });
  }
  for (const lot of state.lots)
    if (lot.balance < 0 || lot.balance > lot.initialQuantity)
      issues.push({
        key: `lote:${lot.id}`,
        message: `O lote ${lot.code} ficou com saldo inválido (${lot.balance} de ${lot.initialQuantity}).`,
      });
  for (const material of state.materials)
    if (material.stockGrams < 0)
      issues.push({
        key: `estoque-material:${material.id}`,
        message: `O estoque de ${material.type} ${material.color} ficou negativo.`,
      });
  for (const payment of state.payments) {
    if (
      payment.receipts?.length &&
      Math.abs(cents(receiptsOf(payment).reduce((a, r) => a + r.amount, 0)) - payment.received) > 0.01
    )
      issues.push({ key: `recebimento:${payment.id}`, message: "Um recebimento não bate com a soma das parcelas recebidas." });
    if (payment.status !== "estornado" && payment.received > payment.expected + 0.01)
      issues.push({
        key: `recebimento-excedente:${payment.id}`,
        message: "Um pedido ficou com recebimento maior que o valor a receber.",
      });
  }
  for (const expense of state.expenses)
    if (expense.status !== "cancelado" && !(expense.amount > 0))
      issues.push({ key: `despesa:${expense.id}`, message: `A conta "${expense.description}" ficou sem valor.` });
  const seen = (values: string[], prefix: string, label: string) => {
    const count = new Map<string, number>();
    for (const value of values) if (value) count.set(normalize(value), (count.get(normalize(value)) || 0) + 1);
    for (const [value, n] of count)
      if (n > 1) issues.push({ key: `${prefix}:${value}`, message: `${label} ${value.toUpperCase()} aparece ${n} vezes.` });
  };
  seen(
    state.orders.map((o) => o.number),
    "pedido-duplicado",
    "O pedido",
  );
  seen(
    state.products.map((p) => p.sku),
    "sku-duplicado",
    "O SKU",
  );
  seen(
    state.productionOrders.map((o) => o.number),
    "op-duplicada",
    "A ordem de produção",
  );
  return issues;
}

/** Problemas que aparecem depois da gravação e não existiam antes. */
export function newIntegrityIssues(previous: AppState, next: AppState) {
  const before = new Set(integrityIssues(previous).map((issue) => issue.key));
  return integrityIssues(next).filter((issue) => !before.has(issue.key));
}
