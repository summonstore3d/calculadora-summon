import test from "node:test";
import assert from "node:assert/strict";
import { calculateCost, defaults, emptyState, type AppState } from "./summon.ts";
import { createOrder } from "./operations.ts";
import { buildQuote, quoteText, setQuoteLink } from "./quote.ts";

const snapshot = calculateCost({ parts: [], hours: 1, manualHours: 0, wastePercent: 0, failurePercent: 0, other: 10 }, defaults);
const base = (): AppState => ({
  ...emptyState,
  settings: { ...defaults, businessName: "Oficina 3D", businessContact: "(11) 98888-7777", quoteValidityDays: 10, quoteNotes: "Pagamento 50% na aprovação." },
  products: [{ id: "p1", sku: "P1", name: "Deckbox", description: "", category: "T", universe: "", tags: [], dimensions: "", leadDays: 3, minimumStock: 0, fulfillment: "ready", status: "active", activeRecipeId: "", readyStock: 0, snapshot, createdAt: "2026-01-01T00:00:00Z" }],
});

test("orçamento traz preços, prazo e validade, sem custo nem lucro", () => {
  const { state, order } = createOrder(base(), { channel: "direct", customerName: "Ana", items: [{ productId: "p1", quantity: 2, unitPrice: 45, discount: 5 }], shippingCharged: 20, paymentMethod: "Pix" }, "2026-10-24T15:00:00.000Z");
  const q = buildQuote(state, order);
  assert.equal(q.total, 105);
  assert.equal(q.validUntil, "2026-11-03");
  assert.equal(q.leadDays, 3);
  const text = quoteText(q);
  assert.match(text, /Oficina 3D/);
  assert.match(text, /2× Deckbox: R\$\s?85,00/);
  assert.match(text, /Total: R\$\s?105,00/);
  assert.match(text, /Válido até 03\/11\/2026/);
  assert.doesNotMatch(JSON.stringify(q), /cost|profit|margin/i);
});

test("link público pode ser criado e desativado", () => {
  const { state, order } = createOrder(base(), { channel: "direct", items: [{ productId: "p1", quantity: 1 }] });
  const on = setQuoteLink(state, order.id, true), token = on.orders[0].quoteToken!;
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.equal(setQuoteLink(on, order.id, true).orders[0].quoteToken, token, "reabrir mantém o mesmo link");
  assert.equal(setQuoteLink(on, order.id, false).orders[0].quoteToken, undefined);
});
