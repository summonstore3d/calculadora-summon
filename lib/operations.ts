// Operações que antes eram montadas dentro das telas: criar pedido e registrar compra de filamento.
import {
  cents,
  channelPrice,
  nextSequence,
  today,
  uid,
  type AppState,
  type Channel,
  type Movement,
  type Order,
  type Purchase,
} from "./summon.ts";
import { expectedReceivable, purchaseExpenses, type PurchasePaymentPlan } from "./finance.ts";

export type OrderInput = {
  customerId?: string;
  customerName?: string;
  channel: Channel;
  seller?: string;
  items: { productId: string; quantity: number; unitPrice?: number; discount?: number }[];
  discount?: number;
  shippingCharged?: number;
  shippingPaid?: number;
  otherCosts?: number;
  paymentMethod?: string;
  origin?: string;
  campaignId?: string;
  note?: string;
};

/** Cria um orçamento com a conta a receber correspondente. Preço vazio usa o preço sugerido do canal. */
export function createOrder(state: AppState, input: OrderInput, now = new Date().toISOString()) {
  const lines = input.items.filter((item) => item.productId && item.quantity > 0);
  if (!lines.length) throw new Error("Adicione ao menos um produto");
  const items = lines.map((line) => {
    const product = state.products.find((p) => p.id === line.productId);
    if (!product) throw new Error("Produto do pedido não encontrado");
    const quantity = Math.trunc(line.quantity),
      unitPrice = cents(line.unitPrice || channelPrice(product, input.channel)),
      discount = cents(Math.max(0, line.discount || 0));
    if (quantity < 1) throw new Error(`Quantidade inválida para ${product.name}`);
    if (discount > unitPrice * quantity) throw new Error(`O desconto de ${product.name} passa do valor do item`);
    return {
      id: uid(),
      productId: product.id,
      productName: product.name,
      productSku: product.sku,
      category: product.category,
      universe: product.universe,
      quantity,
      unitPrice,
      discount,
      revenue: cents(unitPrice * quantity - discount),
      cost: 0,
      fees: 0,
      taxes: 0,
      adsAllocated: 0,
      otherAllocated: 0,
      profit: 0,
      margin: 0,
      lotAllocations: [],
    };
  });
  const st = state.settings,
    itemsGross = cents(items.reduce((a, i) => a + i.unitPrice * i.quantity, 0)),
    itemDiscounts = cents(items.reduce((a, i) => a + i.discount, 0));
  const discount = cents(Math.max(0, input.discount || 0)),
    shippingCharged = cents(Math.max(0, input.shippingCharged || 0));
  if (discount > itemsGross - itemDiscounts) throw new Error("O desconto geral passa do valor dos produtos");
  const fees =
    input.channel === "shopee"
      ? cents((itemsGross * st.shopeeFee) / 100 + st.shopeeFixed)
      : input.channel === "ml"
        ? cents((itemsGross * st.mlFee) / 100 + st.mlFixed)
        : 0;
  const taxes = cents(((itemsGross - discount - itemDiscounts) * st.taxRate) / 100);
  const customer = state.customers.find((c) => c.id === input.customerId);
  const order: Order = {
    id: uid(),
    number: nextSequence(
      state.orders.map((o) => o.number),
      "PV-",
      5,
    ),
    customerId: customer?.id,
    customerName: customer?.name || input.customerName?.trim() || "Consumidor",
    channel: input.channel,
    seller: input.seller?.trim() || "",
    items,
    status: "orcamento",
    discount,
    fees,
    taxes,
    shippingCharged,
    shippingPaid: cents(Math.max(0, input.shippingPaid || 0)),
    advertisingCost: 0,
    otherCosts: cents(Math.max(0, input.otherCosts || 0)),
    paymentMethod: input.paymentMethod?.trim() || "",
    paymentStatus: "pendente",
    origin: input.origin?.trim() || customer?.origin || "",
    campaignId: input.campaignId || customer?.campaignId,
    addressSnapshot: customer ? [customer.address, customer.city, customer.state, customer.zip].filter(Boolean).join(", ") : "",
    note: input.note?.trim() || "",
    gross: cents(itemsGross + shippingCharged),
    netRevenue: cents(itemsGross + shippingCharged - discount - itemDiscounts),
    cost: 0,
    profit: 0,
    margin: 0,
    stockAllocated: false,
    stockApplied: false,
    productionOrderIds: [],
    history: [{ id: uid(), status: "orcamento", note: "Pedido criado", createdAt: now }],
    createdAt: now,
  };
  const payment = {
    id: uid(),
    orderId: order.id,
    ...expectedReceivable(order, st),
    received: 0,
    method: order.paymentMethod,
    status: "pendente" as const,
  };
  return { state: { ...state, orders: [...state.orders, order], payments: [...state.payments, payment] }, order };
}

export type PurchaseInput = {
  kg: number;
  subtotal: number;
  freight?: number;
  date?: string;
  supplierId?: string;
  note?: string;
  payment: PurchasePaymentPlan;
};

/** Entrada de filamento: soma ao estoque, recalcula o custo médio e cria a saída no caixa ou as contas a pagar. */
export function registerPurchase(state: AppState, materialId: string, input: PurchaseInput, now = new Date().toISOString()) {
  const material = state.materials.find((m) => m.id === materialId);
  if (!material) throw new Error("Material não encontrado");
  const kg = Number(input.kg) || 0,
    subtotal = cents(Number(input.subtotal) || 0),
    freight = cents(Math.max(0, Number(input.freight) || 0)),
    total = cents(subtotal + freight);
  if (kg <= 0 || subtotal < 0) throw new Error("Informe um peso e um valor válidos");
  if (input.payment.mode !== "paid" && !input.payment.dueDate) throw new Error("Informe o primeiro vencimento");
  const grams = cents(kg * 1000),
    next = cents(material.stockGrams + grams);
  const averageCost = next ? cents((material.stockGrams * material.averageCost + grams * (total / kg)) / next) : 0;
  const purchase: Purchase = {
    id: uid(),
    materialId,
    supplierId: input.supplierId || material.supplierId,
    kg,
    subtotal,
    freight,
    total,
    date: input.date || today(),
    note: input.note?.trim() || "",
  };
  const movement: Movement = {
    id: uid(),
    entity: "material",
    entityId: materialId,
    kind: "purchase",
    quantity: grams,
    balanceAfter: next,
    referenceId: purchase.id,
    unitCost: total / kg,
    note: purchase.note,
    createdAt: now,
  };
  const payables = total > 0 ? purchaseExpenses(purchase, `${material.type} ${material.color}`, input.payment) : [];
  return {
    state: {
      ...state,
      materials: state.materials.map((m) =>
        m.id === materialId ? { ...m, stockGrams: next, averageCost, supplierId: purchase.supplierId } : m,
      ),
      purchases: [...state.purchases, purchase],
      movements: [...state.movements, movement],
      expenses: [...state.expenses, ...payables],
    },
    purchase,
    payables,
  };
}
