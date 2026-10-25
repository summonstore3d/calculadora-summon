// Orçamento para o cliente: só preços, prazo e condições. Nunca custo, margem ou lucro.
import { addDays } from "./finance.ts";
import { cents, localDay, money, type AppState, type Order } from "./summon.ts";

export type Quote = {
  businessName: string;
  businessContact: string;
  number: string;
  customerName: string;
  issuedAt: string;
  validUntil: string;
  leadDays: number;
  items: { name: string; quantity: number; unitPrice: number; discount: number; total: number; imageUrl?: string }[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  paymentMethod: string;
  notes: string;
};

export function buildQuote(state: AppState, order: Order): Quote {
  const issuedAt = localDay(order.createdAt),
    st = state.settings;
  const items = order.items.map((i) => ({
    name: i.productName,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discount: i.discount,
    total: cents(i.unitPrice * i.quantity - i.discount),
    imageUrl: state.products.find((p) => p.id === i.productId)?.imageUrl,
  }));
  const leadDays = Math.max(0, ...order.items.map((i) => state.products.find((p) => p.id === i.productId)?.leadDays || 0));
  return {
    businessName: st.businessName?.trim() || "Orçamento",
    businessContact: st.businessContact?.trim() || "",
    number: order.number,
    customerName: order.customerName,
    issuedAt,
    validUntil: addDays(issuedAt, st.quoteValidityDays ?? 7),
    leadDays,
    items,
    subtotal: cents(items.reduce((a, i) => a + i.total, 0)),
    discount: order.discount,
    shipping: order.shippingCharged,
    total: order.netRevenue,
    paymentMethod: order.paymentMethod,
    notes: [st.quoteNotes?.trim(), order.note?.trim()].filter(Boolean).join("\n"),
  };
}

const br = (day: string) => day.split("-").reverse().join("/");

/** Texto para colar no WhatsApp ou no e-mail. */
export function quoteText(q: Quote) {
  return [
    `*${q.businessName}*`,
    `Orçamento ${q.number} · ${q.customerName}`,
    "",
    ...q.items.map(
      (i) => `• ${i.quantity}× ${i.name}: ${money(i.total)}${i.discount ? ` (desconto de ${money(i.discount)})` : ""}`,
    ),
    "",
    ...(q.discount ? [`Desconto: −${money(q.discount)}`] : []),
    ...(q.shipping ? [`Frete: ${money(q.shipping)}`] : []),
    `*Total: ${money(q.total)}*`,
    ...(q.paymentMethod ? [`Pagamento: ${q.paymentMethod}`] : []),
    `Prazo de produção: ${q.leadDays ? `${q.leadDays} dia${q.leadDays === 1 ? "" : "s"} úteis após a aprovação` : "a combinar"}`,
    `Válido até ${br(q.validUntil)}`,
    ...(q.notes ? ["", q.notes] : []),
    ...(q.businessContact ? ["", q.businessContact] : []),
  ].join("\n");
}

/** Código do link público: 128 bits aleatórios, impossível de adivinhar. */
export function newQuoteToken() {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function setQuoteLink(state: AppState, orderId: string, enabled: boolean) {
  if (!state.orders.some((o) => o.id === orderId)) throw new Error("Pedido não encontrado");
  return {
    ...state,
    orders: state.orders.map((o) =>
      o.id === orderId ? { ...o, quoteToken: enabled ? o.quoteToken || newQuoteToken() : undefined } : o,
    ),
  };
}
