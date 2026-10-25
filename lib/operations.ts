// Operações de estoque e venda que antes eram montadas dentro das telas: pedido, compra de filamento e outros insumos.
import {
  cents,
  channelPrice,
  nextSequence,
  normalize,
  today,
  uid,
  type AppState,
  type Channel,
  type Movement,
  type Order,
  type Purchase,
  type Supply,
} from "./summon.ts";
import {
  SUPPLY_PURCHASE_CATEGORY,
  expectedReceivable,
  inventoryExpenses,
  purchaseExpenses,
  type PurchasePaymentPlan,
} from "./finance.ts";

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

// ---------------------------------------------------------------- outros insumos

export type SupplyInput = { name: string; unit: string; minimum: number; supplierId?: string; location?: string };

function validateSupply(state: AppState, input: SupplyInput, id?: string) {
  if (!input.name.trim()) throw new Error("Informe o nome do insumo");
  if (state.supplies.some((x) => x.id !== id && x.status === "active" && normalize(x.name) === normalize(input.name)))
    throw new Error("Já existe um insumo com este nome");
  if (input.minimum < 0) throw new Error("O estoque mínimo não pode ser negativo");
}

export function createSupply(
  state: AppState,
  input: SupplyInput & { stock?: number; averageCost?: number },
  now = new Date().toISOString(),
) {
  validateSupply(state, input);
  const stock = cents(Math.max(0, input.stock || 0));
  const supply: Supply = {
    id: uid(),
    name: input.name.trim(),
    unit: input.unit.trim() || "un",
    stock,
    averageCost: Math.max(0, input.averageCost || 0),
    minimum: cents(input.minimum),
    supplierId: input.supplierId || undefined,
    location: input.location?.trim() || "",
    status: "active",
    createdAt: now,
  };
  const movements: Movement[] = stock
    ? [
        {
          id: uid(),
          entity: "supply",
          entityId: supply.id,
          kind: "initial",
          quantity: stock,
          balanceAfter: stock,
          unitCost: supply.averageCost,
          note: "Saldo inicial",
          createdAt: now,
        },
      ]
    : [];
  return { state: { ...state, supplies: [...state.supplies, supply], movements: [...state.movements, ...movements] }, supply };
}

export function updateSupply(state: AppState, supplyId: string, input: SupplyInput & { status?: Supply["status"] }) {
  if (!state.supplies.some((x) => x.id === supplyId)) throw new Error("Insumo não encontrado");
  validateSupply(state, input, supplyId);
  return {
    ...state,
    supplies: state.supplies.map((x) =>
      x.id === supplyId
        ? {
            ...x,
            name: input.name.trim(),
            unit: input.unit.trim() || "un",
            minimum: cents(input.minimum),
            supplierId: input.supplierId || undefined,
            location: input.location?.trim() || "",
            status: input.status || x.status,
          }
        : x,
    ),
  };
}

/** Contagem física: define, soma ou retira do saldo, sempre com motivo. */
export function adjustSupplyStock(
  state: AppState,
  supplyId: string,
  input: { operation: "set" | "add" | "remove"; quantity: number; reason: string },
  now = new Date().toISOString(),
) {
  const supply = state.supplies.find((x) => x.id === supplyId);
  if (!supply) throw new Error("Insumo não encontrado");
  if (!input.reason.trim()) throw new Error("Informe o motivo do ajuste");
  const quantity = cents(Math.max(0, input.quantity)),
    next =
      input.operation === "set"
        ? quantity
        : input.operation === "add"
          ? cents(supply.stock + quantity)
          : cents(supply.stock - quantity);
  if (next < 0) throw new Error("O ajuste deixaria o estoque negativo");
  const movement: Movement = {
    id: uid(),
    entity: "supply",
    entityId: supplyId,
    kind: "inventory-adjustment",
    quantity: cents(next - supply.stock),
    balanceAfter: next,
    unitCost: supply.averageCost,
    note: input.reason.trim(),
    createdAt: now,
  };
  return {
    ...state,
    supplies: state.supplies.map((x) => (x.id === supplyId ? { ...x, stock: next } : x)),
    movements: [...state.movements, movement],
  };
}

export type SupplyPurchaseInput = {
  quantity: number;
  subtotal: number;
  freight?: number;
  date?: string;
  supplierId?: string;
  note?: string;
  payment: PurchasePaymentPlan;
};

/** Entrada de outro insumo: soma ao estoque, recalcula o custo médio e cria a saída no caixa ou as contas a pagar. */
export function registerSupplyPurchase(
  state: AppState,
  supplyId: string,
  input: SupplyPurchaseInput,
  now = new Date().toISOString(),
) {
  const supply = state.supplies.find((x) => x.id === supplyId);
  if (!supply) throw new Error("Insumo não encontrado");
  const quantity = cents(Number(input.quantity) || 0),
    subtotal = cents(Number(input.subtotal) || 0),
    freight = cents(Math.max(0, Number(input.freight) || 0)),
    total = cents(subtotal + freight);
  if (quantity <= 0 || subtotal < 0) throw new Error("Informe uma quantidade e um valor válidos");
  if (input.payment.mode !== "paid" && !input.payment.dueDate) throw new Error("Informe o primeiro vencimento");
  // Custo médio com 4 casas: insumos baratos (R$ 0,15 o ímã) perderiam precisão em centavos.
  const next = cents(supply.stock + quantity),
    averageCost = next ? Math.round(((supply.stock * supply.averageCost + total) / next) * 10000) / 10000 : 0;
  const date = input.date || today(),
    note = input.note?.trim() || "",
    id = uid();
  const movement: Movement = {
    id,
    entity: "supply",
    entityId: supplyId,
    kind: "purchase",
    quantity,
    balanceAfter: next,
    referenceId: id,
    unitCost: total / quantity,
    note,
    createdAt: now,
  };
  const payables =
    total > 0
      ? inventoryExpenses(
          { id, total, date, note },
          `Compra ${supply.name} (${String(quantity).replace(".", ",")} ${supply.unit})`,
          SUPPLY_PURCHASE_CATEGORY,
          "supply-purchase",
          input.payment,
        )
      : [];
  return {
    state: {
      ...state,
      supplies: state.supplies.map((x) =>
        x.id === supplyId ? { ...x, stock: next, averageCost, supplierId: input.supplierId || x.supplierId } : x,
      ),
      movements: [...state.movements, movement],
      expenses: [...state.expenses, ...payables],
    },
    payables,
  };
}
