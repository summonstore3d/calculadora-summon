"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  Search,
  X,
} from "lucide-react";
import { QuoteView } from "@/components/quote-view";
import { buildQuote, quoteText, setQuoteLink } from "@/lib/quote";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AppState,
  Channel,
  Order,
  cents,
  channelPrice,
  completeSale,
  financialBreakdown,
  localDay,
  money,
  normalize,
  orderTransitions,
  removeCustomer,
  returnSale,
  transitionOrder,
  uid,
  updateCustomer,
  updateDraftOrder,
} from "@/lib/summon";
import { createOrder } from "@/lib/operations";
import {
  DataTable,
  Empty,
  Field,
  ProductThumb,
  PageHead,
  SaveButton,
  SelectField,
  channelLabel,
  dateLabel,
  n,
  s,
  statusLabel,
} from "@/components/app/shared";

export function FinancialTraceDialog({
  open,
  onOpenChange,
  orders,
  expenses,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orders: any[];
  expenses: number;
  state: AppState;
}) {
  const details = orders.map((order) => ({ order, breakdown: financialBreakdown(order) })),
    totals = details.reduce(
      (sum, row) => ({
        revenue: sum.revenue + row.breakdown.revenue,
        productCost: sum.productCost + row.breakdown.productCost,
        fees: sum.fees + row.breakdown.fees,
        taxes: sum.taxes + row.breakdown.taxes,
        shipping: sum.shipping + row.breakdown.shipping,
        advertising: sum.advertising + row.breakdown.advertising,
        other: sum.other + row.breakdown.other,
        profit: sum.profit + row.breakdown.calculatedProfit,
      }),
      { revenue: 0, productCost: 0, fees: 0, taxes: 0, shipping: 0, advertising: 0, other: 0, profit: 0 },
    ),
    finalResult = cents(totals.profit - expenses);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="financial-trace-dialog">
        <DialogHeader>
          <DialogTitle>Composição do resultado</DialogTitle>
          <DialogDescription>Da receita líquida ao lucro final, com rastreabilidade por pedido e produto.</DialogDescription>
        </DialogHeader>
        <div className="financial-waterfall">
          <div className="positive-line">
            <span>Receita líquida</span>
            <b>{money(totals.revenue)}</b>
          </div>
          <div>
            <span>(–) Produtos vendidos</span>
            <b>{money(totals.productCost)}</b>
          </div>
          <div>
            <span>(–) Taxas dos canais</span>
            <b>{money(totals.fees)}</b>
          </div>
          <div>
            <span>(–) Impostos</span>
            <b>{money(totals.taxes)}</b>
          </div>
          <div>
            <span>(–) Fretes pagos</span>
            <b>{money(totals.shipping)}</b>
          </div>
          <div>
            <span>(–) Anúncios</span>
            <b>{money(totals.advertising)}</b>
          </div>
          <div>
            <span>(–) Outros custos da venda</span>
            <b>{money(totals.other)}</b>
          </div>
          <div>
            <span>(–) Despesas operacionais</span>
            <b>{money(expenses)}</b>
          </div>
          <div className={finalResult >= 0 ? "result-positive" : "result-negative"}>
            <span>Resultado final</span>
            <b>{money(finalResult)}</b>
          </div>
        </div>
        <div className="trace-orders">
          <div className="section-label">
            <span>Pedidos do período</span>
            <small>
              {orders.length} venda{orders.length === 1 ? "" : "s"} concluída{orders.length === 1 ? "" : "s"}
            </small>
          </div>
          {details.length ? (
            details.map(({ order, breakdown }) => (
              <details
                className={`trace-order ${breakdown.anomalies.length ? "has-warning" : ""}`}
                key={order.id}
                open={details.length === 1}
              >
                <summary>
                  <span>
                    <b>{order.number}</b>
                    <small>
                      {order.customerName} · {dateLabel(order.completedAt || order.createdAt)}
                    </small>
                  </span>
                  <span>
                    <b>{money(breakdown.calculatedProfit)}</b>
                    <small>{breakdown.margin.toFixed(1)}% de margem</small>
                  </span>
                  <ChevronDown />
                </summary>
                <OrderFinancialDetail order={order} state={state} />
              </details>
            ))
          ) : (
            <Empty title="Nenhuma venda concluída" description="A composição aparecerá quando houver vendas no período." />
          )}
        </div>
        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function OrderFinancialDetail({ order, state }: { order: any; state: AppState }) {
  const result = financialBreakdown(order),
    rows = [
      ["Receita líquida", result.revenue],
      ["Custo dos produtos", -result.productCost],
      ["Taxas", -result.fees],
      ["Impostos", -result.taxes],
      ["Frete pago", -result.shipping],
      ["Anúncios", -result.advertising],
      ["Outros custos", -result.other],
      ["Lucro", result.calculatedProfit],
    ] as [string, number][];
  return (
    <div className="order-financial-detail">
      {result.anomalies.length > 0 && (
        <div className="financial-warnings">
          {result.anomalies.map((warning: string) => (
            <p key={warning}>
              <AlertTriangle />
              {warning}
            </p>
          ))}
        </div>
      )}
      <div className="order-breakdown">
        {rows.map(([label, value], index) => (
          <div className={index === rows.length - 1 ? (value >= 0 ? "result-positive" : "result-negative") : ""} key={label}>
            <span>{label}</span>
            <b>{money(value)}</b>
          </div>
        ))}
      </div>
      <div className="item-cost-list">
        {order.items.map((item: any) => {
          const product = state.products.find((p) => p.id === item.productId),
            predicted = product?.snapshot.unitCost || 0,
            actual = item.quantity ? item.cost / item.quantity : 0,
            variance = predicted ? ((actual - predicted) / predicted) * 100 : 0,
            lots = item.lotAllocations
              .map((allocation: any) => state.lots.find((l) => l.id === allocation.lotId))
              .filter(Boolean);
          return (
            <div className="item-cost-card" key={item.id}>
              <div>
                <b>
                  {item.quantity}× {item.productName}
                </b>
                <small>{item.productSku}</small>
              </div>
              <div>
                <span>Custo previsto/un.</span>
                <b>{money(predicted)}</b>
              </div>
              <div>
                <span>Custo realizado/un.</span>
                <b>{money(actual)}</b>
              </div>
              <div>
                <span>Variação</span>
                <b className={variance > 10 ? "negative" : variance < 0 ? "positive" : ""}>
                  {variance >= 0 ? "+" : ""}
                  {variance.toFixed(1)}%
                </b>
              </div>
              {lots.map((lot: any) => (
                <div className="lot-cost-detail" key={lot.id}>
                  <span>
                    {lot.code} · {money(lot.unitCost)}/un
                  </span>
                  {lot.costBreakdown ? (
                    <small>
                      Materiais {money(lot.costBreakdown.materials)} · energia {money(lot.costBreakdown.energy)} · máquina{" "}
                      {money(lot.costBreakdown.depreciation)} · trabalho {money(lot.costBreakdown.labor)} · manutenção{" "}
                      {money(lot.costBreakdown.maintenance)} · outros {money(lot.costBreakdown.other)}
                    </small>
                  ) : (
                    <small>Lote histórico sem composição detalhada.</small>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CustomersPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("active"),
    [createOpen, setCreateOpen] = useState(false),
    [editId, setEditId] = useState<string | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null),
    rows = state.customers.filter(
      (c) =>
        normalize(c.name + " " + c.phone + " " + c.email + " " + c.city + " " + c.state).includes(normalize(q)) &&
        (status === "all" || (c.status || "active") === status),
    ),
    editCustomer = state.customers.find((c) => c.id === editId),
    removeTarget = state.customers.find((c) => c.id === removeId),
    hasOrders = Boolean(removeTarget && state.orders.some((o) => o.customerId === removeTarget.id));
  async function edit(e: any) {
    e.preventDefault();
    if (!editCustomer) return;
    const f = new FormData(e.currentTarget);
    try {
      const next = updateCustomer(state, editCustomer.id, {
        name: s(f, "name"),
        phone: s(f, "phone"),
        email: s(f, "email"),
        document: s(f, "document"),
        zip: s(f, "zip"),
        city: s(f, "city"),
        state: s(f, "state").toUpperCase(),
        address: s(f, "address"),
        origin: s(f, "origin"),
        campaignId: s(f, "campaignId") || undefined,
        tags: s(f, "tags")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
        note: s(f, "note"),
        consent: Boolean(f.get("consent")),
        status: s(f, "status") as any,
      });
      if (await save(next, "customer-edit")) {
        toast.success("Cliente atualizado");
        setEditId(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  async function remove() {
    if (!removeTarget) return;
    try {
      const result = removeCustomer(state, removeTarget.id);
      if (await save(result.state, result.archived ? "customer-archive" : "customer-delete")) {
        toast.success(result.archived ? "Cliente arquivado para preservar seus pedidos" : "Cliente excluído");
        setRemoveId(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  return (
    <>
      <PageHead
        title="Clientes"
        description="Cadastro, localização, recorrência e rentabilidade."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Novo cliente
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cliente, contato ou cidade" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {rows.length ? (
        <DataTable headers={["Cliente", "Contato", "Localização", "Pedidos", "Faturamento", "Lucro", "Origem", "Ações"]}>
          {rows.map((c) => {
            const orders = state.orders.filter((o) => o.customerId === c.id && o.status === "concluido");
            return (
              <tr key={c.id}>
                <td data-label="Cliente">
                  <b>{c.name}</b>
                  <small>{c.email}</small>
                </td>
                <td data-label="Contato">{c.phone || "—"}</td>
                <td data-label="Localização">{[c.city, c.state].filter(Boolean).join(" / ") || "—"}</td>
                <td data-label="Pedidos">{orders.length}</td>
                <td data-label="Faturamento">{money(orders.reduce((a, o) => a + o.netRevenue, 0))}</td>
                <td data-label="Lucro">{money(orders.reduce((a, o) => a + o.profit, 0))}</td>
                <td data-label="Origem">
                  {c.origin || "—"}
                  {c.status === "archived" && <Badge variant="outline">Arquivado</Badge>}
                </td>
                <td data-label="Ações">
                  <div className="row-actions">
                    <Button size="sm" variant="outline" onClick={() => setEditId(c.id)}>
                      <Pencil />
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="danger-action" onClick={() => setRemoveId(c.id)}>
                      Excluir
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <Empty title="Nenhum cliente encontrado" description="Cadastre clientes para analisar recorrência e localização." />
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="entity-dialog">
          <DialogHeader>
            <DialogTitle>Novo cliente</DialogTitle>
            <DialogDescription>
              Cadastre os dados essenciais agora; informações complementares poderão ser editadas depois.
            </DialogDescription>
          </DialogHeader>
          <form
            className="dialog-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                phone = s(f, "phone"),
                email = s(f, "email");
              if (
                state.customers.some(
                  (c) => (phone && normalize(c.phone) === normalize(phone)) || (email && normalize(c.email) === normalize(email)),
                )
              )
                return toast.error("Já existe um cliente com este telefone ou e-mail.");
              const customer = {
                id: uid(),
                name: s(f, "name"),
                phone,
                email,
                document: s(f, "document"),
                zip: s(f, "zip"),
                city: s(f, "city"),
                state: s(f, "state").toUpperCase(),
                address: s(f, "address"),
                origin: s(f, "origin"),
                campaignId: s(f, "campaignId") || undefined,
                tags: s(f, "tags")
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
                note: s(f, "note"),
                consent: Boolean(f.get("consent")),
                createdAt: new Date().toISOString(),
              };
              if (await save({ ...state, customers: [...state.customers, customer] }, "customer-create")) {
                toast.success("Cliente cadastrado");
                setCreateOpen(false);
              }
            }}
          >
            <div className="form-grid cols-2">
              <Field label="Nome" name="name" required />
              <Field label="Telefone" name="phone" />
              <Field label="E-mail" name="email" type="email" />
              <Field label="Documento" name="document" />
              <Field label="CEP" name="zip" />
              <Field label="Cidade" name="city" />
              <Field label="Estado" name="state" />
              <Field label="Endereço" name="address" />
              <Field label="Origem" name="origin" />
              <SelectField label="Campanha" name="campaignId">
                <option value="">Nenhuma</option>
                {state.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Tags" name="tags" />
              <Field label="Observações" name="note" />
              <label className="check span-2">
                <input type="checkbox" name="consent" /> Consentimento para contato
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>Cadastrar cliente</SaveButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(editCustomer)} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent className="entity-dialog">
          <DialogHeader>
            <DialogTitle>Editar cliente</DialogTitle>
            <DialogDescription>Atualize contato, localização, origem e consentimento.</DialogDescription>
          </DialogHeader>
          {editCustomer && (
            <form className="dialog-form" onSubmit={edit}>
              <div className="form-grid cols-2">
                <Field label="Nome" name="name" value={editCustomer.name} required />
                <Field label="Telefone" name="phone" value={editCustomer.phone} />
                <Field label="E-mail" name="email" type="email" value={editCustomer.email} />
                <Field label="Documento" name="document" value={editCustomer.document} />
                <Field label="CEP" name="zip" value={editCustomer.zip} />
                <Field label="Cidade" name="city" value={editCustomer.city} />
                <Field label="Estado" name="state" value={editCustomer.state} />
                <Field label="Endereço" name="address" value={editCustomer.address} />
                <Field label="Origem" name="origin" value={editCustomer.origin} />
                <SelectField label="Campanha" name="campaignId" value={editCustomer.campaignId || ""}>
                  <option value="">Nenhuma</option>
                  {state.campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </SelectField>
                <Field label="Tags" name="tags" value={editCustomer.tags.join(", ")} />
                <SelectField label="Situação" name="status" value={editCustomer.status || "active"}>
                  <option value="active">Ativo</option>
                  <option value="archived">Arquivado</option>
                </SelectField>
                <Field label="Observações" name="note" value={editCustomer.note} className="span-2" />
                <label className="check span-2">
                  <input type="checkbox" name="consent" defaultChecked={editCustomer.consent} /> Consentimento para contato
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditId(null)}>
                  Cancelar
                </Button>
                <SaveButton saving={saving}>Salvar cliente</SaveButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(removeTarget)} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{hasOrders ? "Arquivar cliente?" : "Excluir cliente?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {hasOrders
                ? "Este cliente possui pedidos vinculados. Ele será arquivado para preservar o histórico comercial."
                : "Este cliente ainda não possui pedidos e será excluído permanentemente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={saving}>
              {hasOrders ? "Arquivar" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function OrdersPage({
  state,
  save,
  saving,
  initialOrderRef,
  onOrderRefChange,
  linkEnabled = false,
}: {
  state: AppState;
  save: any;
  saving: boolean;
  initialOrderRef?: string;
  onOrderRefChange: (value?: string) => void;
  linkEnabled?: boolean;
}) {
  const [items, setItems] = useState([{ productId: "", quantity: 1, unitPrice: 0, discount: 0 }]),
    [orderChannel, setOrderChannel] = useState<Channel>("direct"),
    [createOpen, setCreateOpen] = useState(false),
    [financialOrderId, setFinancialOrderId] = useState<string | null>(null),
    [detailOrderId, setDetailOrderId] = useState<string | null>(null),
    [editOrderId, setEditOrderId] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [channel, setChannel] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [page, setPage] = useState(1),
    financialOrder = state.orders.find((o) => o.id === financialOrderId),
    detailOrder = state.orders.find((o) => o.id === detailOrderId),
    editOrder = state.orders.find((o) => o.id === editOrderId),
    pageSize = 8;
  const filtered = useMemo(
      () =>
        state.orders
          .filter((order) => {
            const term = normalize(q),
              haystack = normalize(
                `${order.number} ${order.customerName} ${order.items.map((item) => `${item.productName} ${item.productSku}`).join(" ")}`,
              ),
              date = localDay(order.createdAt);
            return (
              (!term || haystack.includes(term)) &&
              (status === "all" || order.status === status) &&
              (channel === "all" || order.channel === channel) &&
              (!from || date >= from) &&
              (!to || date <= to)
            );
          })
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      [state.orders, q, status, channel, from, to],
    ),
    pageCount = Math.max(1, Math.ceil(filtered.length / pageSize)),
    currentPage = Math.min(page, pageCount),
    pageRows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    clearFilters = () => {
      setQ("");
      setStatus("all");
      setChannel("all");
      setFrom("");
      setTo("");
      setPage(1);
    };
  useEffect(() => setPage(1), [q, status, channel, from, to]);
  useEffect(() => {
    if (!initialOrderRef) {
      setDetailOrderId(null);
      return;
    }
    const order = state.orders.find((o) => o.id === initialOrderRef || normalize(o.number) === normalize(initialOrderRef));
    if (order) setDetailOrderId(order.id);
  }, [initialOrderRef, state.orders]);
  return (
    <>
      <PageHead
        title="Pedidos"
        description="Venda, pagamento, mídia atribuída e lucro realizado."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Novo pedido
          </Button>
        }
      />
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="order-create-dialog">
          <DialogHeader>
            <DialogTitle>Novo pedido</DialogTitle>
            <DialogDescription>
              Informe cliente, canal e itens. O estoque e a necessidade de produção serão tratados no avanço do pedido.
            </DialogDescription>
          </DialogHeader>
          <form
            className="stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                customer = state.customers.find((c) => c.id === s(f, "customerId")),
                channel = s(f, "channel") as any,
                valid = items.filter((i) => i.productId && i.quantity > 0);
              let created;
              try {
                created = createOrder(state, {
                  customerId: customer?.id,
                  customerName: s(f, "customerName"),
                  channel,
                  seller: s(f, "seller"),
                  items: valid,
                  discount: n(f, "discount"),
                  shippingCharged: n(f, "shippingCharged"),
                  shippingPaid: n(f, "shippingPaid"),
                  otherCosts: n(f, "otherCosts"),
                  paymentMethod: s(f, "paymentMethod"),
                  origin: s(f, "origin"),
                  campaignId: s(f, "campaignId") || undefined,
                  note: s(f, "note"),
                });
              } catch (error: any) {
                return toast.error(error.message);
              }
              if (await save(created.state, "order-create")) {
                toast.success("Pedido criado");
                setItems([{ productId: "", quantity: 1, unitPrice: 0, discount: 0 }]);
                setOrderChannel("direct");
                setCreateOpen(false);
              }
            }}
          >
            <div className="form-grid cols-4">
              <SelectField label="Cliente" name="customerId">
                <option value="">Venda sem cadastro</option>
                {state.customers
                  .filter((c) => (c.status || "active") === "active")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.city}
                    </option>
                  ))}
              </SelectField>
              <Field label="Nome avulso" name="customerName" />
              <label className="field">
                <span>Canal</span>
                <select
                  name="channel"
                  value={orderChannel}
                  onChange={(e) => {
                    const next = e.target.value as Channel;
                    setItems(
                      items.map((x) => {
                        const p = state.products.find((product) => product.id === x.productId);
                        return p && x.unitPrice === channelPrice(p, orderChannel)
                          ? { ...x, unitPrice: channelPrice(p, next) }
                          : x;
                      }),
                    );
                    setOrderChannel(next);
                  }}
                >
                  <option value="direct">Venda direta</option>
                  <option value="shopee">Shopee</option>
                  <option value="ml">Mercado Livre</option>
                  <option value="other">Outro</option>
                </select>
                <small>Os preços sugeridos acompanham o canal; valores digitados à mão são mantidos.</small>
              </label>
              <Field label="Vendedor" name="seller" />
              <Field label="Desconto geral" name="discount" type="number" step=".01" value="0" />
              <Field label="Frete cobrado" name="shippingCharged" type="number" step=".01" value="0" />
              <Field label="Frete pago" name="shippingPaid" type="number" step=".01" value="0" />
              <Field label="Outros custos" name="otherCosts" type="number" step=".01" value="0" />
              <Field label="Forma de pagamento" name="paymentMethod" />
              <Field label="Origem" name="origin" />
              <SelectField label="Campanha" name="campaignId">
                <option value="">Nenhuma</option>
                {state.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Observação" name="note" />
            </div>
            <div className="section-label">
              <span>Itens</span>
              <small>Busque por nome, SKU ou ID. O preço pode ser ajustado por venda.</small>
            </div>
            {items.map((item, i) => {
              const selected = state.products.find((p) => p.id === item.productId);
              return (
                <div className="order-item" key={i}>
                  <label className="field">
                    <span>Produto</span>
                    <Input
                      list={`products-${i}`}
                      value={selected ? `${selected.name} · ${selected.sku}` : item.productId}
                      placeholder="Digite nome, SKU ou ID"
                      onChange={(e) => {
                        const term = normalize(e.target.value),
                          p = state.products.find(
                            (x) =>
                              x.id === e.target.value ||
                              normalize(`${x.name} · ${x.sku}`) === term ||
                              normalize(x.name) === term ||
                              normalize(x.sku) === term,
                          );
                        setItems(
                          items.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  productId: p?.id || e.target.value,
                                  unitPrice: p ? channelPrice(p, orderChannel) : x.unitPrice,
                                }
                              : x,
                          ),
                        );
                      }}
                    />
                    <datalist id={`products-${i}`}>
                      {state.products
                        .filter((p) => p.status === "active")
                        .map((p) => (
                          <option key={p.id} value={`${p.name} · ${p.sku}`}>
                            {p.id} · {p.readyStock} un
                          </option>
                        ))}
                    </datalist>
                  </label>
                  <label className="field">
                    <span>Qtd.</span>
                    <Input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <label className="field">
                    <span>Preço unit.</span>
                    <Input
                      type="number"
                      step=".01"
                      value={item.unitPrice}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, unitPrice: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <label className="field">
                    <span>Desconto</span>
                    <Input
                      type="number"
                      step=".01"
                      value={item.discount}
                      onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, discount: Number(e.target.value) } : x)))}
                    />
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    aria-label="Remover item"
                    onClick={() => items.length > 1 && setItems(items.filter((_, j) => j !== i))}
                  >
                    <X />
                  </Button>
                </div>
              );
            })}
            <DialogFooter className="create-dialog-footer">
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setItems([...items, { productId: "", quantity: 1, unitPrice: 0, discount: 0 }])}
              >
                <Plus />
                Adicionar item
              </Button>
              <SaveButton saving={saving}>Criar pedido</SaveButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="order-filters">
        <div className="search">
          <Search />
          <Input
            aria-label="Buscar pedidos"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar número, cliente, produto ou SKU"
          />
        </div>
        <select aria-label="Filtrar por status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos os status</option>
          {Object.keys(orderTransitions).map((value) => (
            <option value={value} key={value}>
              {statusLabel(value)}
            </option>
          ))}
        </select>
        <select aria-label="Filtrar por canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="all">Todos os canais</option>
          {Object.entries(channelLabel).map(([value, label]) => (
            <option value={value} key={value}>
              {label}
            </option>
          ))}
        </select>
        <label>
          <span>De</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span>Até</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="button" variant="ghost" onClick={clearFilters}>
          Limpar
        </Button>
      </div>
      <div className="order-list-head">
        <span>
          <b>{filtered.length}</b> pedido{filtered.length === 1 ? "" : "s"} encontrado{filtered.length === 1 ? "" : "s"}
        </span>
        <span>{money(filtered.reduce((sum, order) => sum + order.netRevenue, 0))} no resultado filtrado</span>
      </div>
      <div className="order-list">
        {pageRows.map((o) => (
          <Card key={o.id}>
            <CardContent className="order-card">
              <div>
                <small>
                  {o.number} · {dateLabel(o.createdAt)}
                </small>
                <b>{o.customerName}</b>
                <span>{o.items.map((i) => i.quantity + "× " + i.productName).join(", ")}</span>
                {o.stockAllocated && o.status !== "concluido" && <small className="positive">Estoque separado</small>}
                {Boolean(o.productionOrderIds?.length) && o.status === "producao" && (
                  <small>
                    Produção vinculada:{" "}
                    {o.productionOrderIds
                      ?.map((id) => state.productionOrders.find((p) => p.id === id)?.number)
                      .filter(Boolean)
                      .join(", ")}
                  </small>
                )}
              </div>
              <div className="order-money">
                <span>{channelLabel[o.channel]}</span>
                <b>{money(o.netRevenue)}</b>
                {o.status === "concluido" && (
                  <small className={o.profit >= 0 ? "positive" : "negative"}>
                    Lucro {money(o.profit)} · {o.margin.toFixed(1)}%
                  </small>
                )}
              </div>
              <Badge variant={o.status === "concluido" ? "secondary" : o.status === "devolvido" ? "destructive" : "outline"}>
                {statusLabel(o.status)}
              </Badge>
              <div className="order-row-actions">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDetailOrderId(o.id);
                    onOrderRefChange(o.number);
                  }}
                >
                  <Eye />
                  Detalhes
                </Button>
                {o.status === "orcamento" && (
                  <Button size="sm" variant="ghost" onClick={() => setEditOrderId(o.id)}>
                    <Pencil />
                    Editar
                  </Button>
                )}
                <OrderActions order={o} state={state} save={save} saving={saving} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {!filtered.length && <Empty title="Nenhum pedido encontrado" description="Ajuste os filtros ou crie um novo pedido." />}
      {filtered.length > pageSize && (
        <div className="pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            <ChevronLeft />
            Anterior
          </Button>
          <span>
            Página {currentPage} de {pageCount}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === pageCount}
            onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
          >
            Próxima
            <ChevronRight />
          </Button>
        </div>
      )}
      {financialOrder && (
        <FinancialTraceDialog
          open={Boolean(financialOrder)}
          onOpenChange={(open) => !open && setFinancialOrderId(null)}
          orders={[financialOrder]}
          expenses={0}
          state={state}
        />
      )}{" "}
      {detailOrder && (
        <OrderDetailDialog
          order={detailOrder}
          state={state}
          open={Boolean(detailOrder)}
          onOpenChange={(open) => {
            if (!open) {
              setDetailOrderId(null);
              onOrderRefChange(undefined);
            }
          }}
          onEdit={() => {
            setDetailOrderId(null);
            setEditOrderId(detailOrder.id);
          }}
          onFinancial={() => setFinancialOrderId(detailOrder.id)}
          save={save}
          saving={saving}
          linkEnabled={linkEnabled}
        />
      )}{" "}
      {editOrder && (
        <OrderEditDialog
          order={editOrder}
          state={state}
          open={Boolean(editOrder)}
          onOpenChange={(open) => !open && setEditOrderId(null)}
          save={save}
          saving={saving}
        />
      )}
    </>
  );
}

export function OrderDetailDialog({
  order,
  state,
  open,
  onOpenChange,
  onEdit,
  onFinancial,
  save,
  saving,
  linkEnabled = false,
}: {
  order: any;
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onFinancial: () => void;
  save: any;
  saving: boolean;
  linkEnabled?: boolean;
}) {
  const [quoteOpen, setQuoteOpen] = useState(false);
  const productions = (order.productionOrderIds || [])
      .map((id: string) => state.productionOrders.find((item) => item.id === id))
      .filter(Boolean),
    history = (order.history || []).slice().reverse();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="order-detail-dialog">
        <DialogHeader>
          <DialogTitle>
            {order.number} · {order.customerName}
          </DialogTitle>
          <DialogDescription>
            Criado em {dateLabel(order.createdAt)} · {channelLabel[order.channel as keyof typeof channelLabel]}
          </DialogDescription>
        </DialogHeader>
        <div className="order-detail-status">
          <Badge
            variant={
              order.status === "concluido"
                ? "secondary"
                : order.status === "cancelado" || order.status === "devolvido"
                  ? "destructive"
                  : "outline"
            }
          >
            {statusLabel(order.status)}
          </Badge>
          <span>
            Pagamento: <b>{statusLabel(order.paymentStatus)}</b>
          </span>
        </div>
        <div className="order-detail-grid">
          <div>
            <span>Vendedor</span>
            <b>{order.seller || "Não informado"}</b>
          </div>
          <div>
            <span>Origem</span>
            <b>{order.origin || "Não informada"}</b>
          </div>
          <div>
            <span>Forma de pagamento</span>
            <b>{order.paymentMethod || "Não informada"}</b>
          </div>
          <div>
            <span>Entrega</span>
            <b>{order.addressSnapshot || "Não informada"}</b>
          </div>
        </div>
        <div className="section-label">
          <span>Itens do pedido</span>
          <small>{order.items.reduce((sum: any, item: any) => sum + item.quantity, 0)} unidade(s)</small>
        </div>
        <div className="order-detail-items">
          {order.items.map((item: any) => (
            <div key={item.id}>
              <ProductThumb
                product={state.products.find((p) => p.id === item.productId) || { id: item.productId, name: item.productName }}
                size={40}
              />
              <span>
                <b>
                  {item.quantity}× {item.productName}
                </b>
                <small>{item.productSku}</small>
              </span>
              <span>{money(item.unitPrice)} / un</span>
              <b>{money(item.unitPrice * item.quantity - item.discount)}</b>
            </div>
          ))}
        </div>
        <div className="order-detail-totals">
          <div>
            <span>Produtos</span>
            <b>{money(order.items.reduce((sum: any, item: any) => sum + item.unitPrice * item.quantity, 0))}</b>
          </div>
          <div>
            <span>Descontos</span>
            <b>− {money(order.discount + order.items.reduce((sum: any, item: any) => sum + item.discount, 0))}</b>
          </div>
          <div>
            <span>Frete cobrado</span>
            <b>{money(order.shippingCharged)}</b>
          </div>
          <div className="order-detail-total">
            <span>Receita líquida</span>
            <b>{money(order.netRevenue)}</b>
          </div>
        </div>
        {productions.length > 0 && (
          <>
            <div className="section-label">
              <span>Produção vinculada</span>
              <small>{productions.length} ordem(ns)</small>
            </div>
            <div className="order-production-links">
              {productions.map((production: any) => (
                <div key={production.id}>
                  <b>{production.number}</b>
                  <span>{state.products.find((p) => p.id === production.productId)?.name}</span>
                  <Badge variant="outline">{statusLabel(production.status)}</Badge>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="section-label">
          <span>Histórico</span>
          <small>{history.length} evento(s)</small>
        </div>
        <div className="order-timeline">
          {history.map((event: any) => (
            <div key={event.id}>
              <i />
              <span>
                <b>{statusLabel(event.status)}</b>
                <small>{event.note}</small>
              </span>
              <time>{new Date(event.createdAt).toLocaleString("pt-BR")}</time>
            </div>
          ))}
        </div>
        {order.note && (
          <div className="order-note">
            <b>Observação</b>
            <p>{order.note}</p>
          </div>
        )}
        <DialogFooter className="order-detail-actions">
          <Button variant="outline" type="button" onClick={() => window.print()}>
            <Printer />
            Imprimir
          </Button>
          {!["cancelado", "devolvido"].includes(order.status) && (
            <Button variant="outline" type="button" onClick={() => setQuoteOpen(true)}>
              <FileText />
              Orçamento para o cliente
            </Button>
          )}
          {order.status === "orcamento" && (
            <Button variant="outline" type="button" onClick={onEdit}>
              <Pencil />
              Editar orçamento
            </Button>
          )}
          {order.status === "concluido" && (
            <Button variant="outline" type="button" onClick={onFinancial}>
              <Eye />
              Ver resultado
            </Button>
          )}
          <OrderActions order={order} state={state} save={save} saving={saving} />
          <Button type="button" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
        <QuoteDialog
          orderId={order.id}
          state={state}
          save={save}
          saving={saving}
          linkEnabled={linkEnabled}
          open={quoteOpen}
          onClose={() => setQuoteOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

export function OrderEditDialog({
  order,
  state,
  open,
  onOpenChange,
  save,
  saving,
}: {
  order: any;
  state: AppState;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  save: any;
  saving: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="order-edit-dialog">
        <DialogHeader>
          <DialogTitle>Editar {order.number}</DialogTitle>
          <DialogDescription>
            Enquanto estiver em orçamento, valores comerciais e quantidades podem ser corrigidos.
          </DialogDescription>
        </DialogHeader>
        <form
          className="order-edit-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            try {
              const next = updateDraftOrder(state, order.id, {
                customerName: s(f, "customerName") || "Consumidor",
                channel: s(f, "channel") as Channel,
                seller: s(f, "seller"),
                discount: n(f, "discount"),
                shippingCharged: n(f, "shippingCharged"),
                shippingPaid: n(f, "shippingPaid"),
                otherCosts: n(f, "otherCosts"),
                paymentMethod: s(f, "paymentMethod"),
                origin: s(f, "origin"),
                campaignId: s(f, "campaignId") || undefined,
                note: s(f, "note"),
                items: order.items.map((item: any) => ({
                  id: item.id,
                  quantity: n(f, `quantity-${item.id}`),
                  unitPrice: n(f, `price-${item.id}`),
                  discount: n(f, `item-discount-${item.id}`),
                })),
              });
              if (await save(next, "order-edit")) {
                toast.success("Orçamento atualizado");
                onOpenChange(false);
              }
            } catch (err: any) {
              toast.error(err.message);
            }
          }}
        >
          <div className="form-grid cols-3">
            <Field label="Cliente" name="customerName" value={order.customerName} required />
            <SelectField label="Canal" name="channel" value={order.channel}>
              {Object.entries(channelLabel).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <Field label="Vendedor" name="seller" value={order.seller} />
            <Field label="Desconto geral" name="discount" type="number" step=".01" value={order.discount} />
            <Field label="Frete cobrado" name="shippingCharged" type="number" step=".01" value={order.shippingCharged} />
            <Field label="Frete pago" name="shippingPaid" type="number" step=".01" value={order.shippingPaid} />
            <Field label="Outros custos" name="otherCosts" type="number" step=".01" value={order.otherCosts} />
            <Field label="Forma de pagamento" name="paymentMethod" value={order.paymentMethod} />
            <Field label="Origem" name="origin" value={order.origin} />
            <SelectField label="Campanha" name="campaignId" value={order.campaignId || ""}>
              <option value="">Nenhuma</option>
              {state.campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>
            <Field label="Observação" name="note" value={order.note} className="span-2" />
          </div>
          <div className="section-label">
            <span>Itens</span>
            <small>Produtos não podem ser substituídos após a criação.</small>
          </div>
          <div className="order-edit-items">
            {order.items.map((item: any) => (
              <div key={item.id}>
                <span>
                  <b>{item.productName}</b>
                  <small>{item.productSku}</small>
                </span>
                <Field label="Quantidade" name={`quantity-${item.id}`} type="number" value={item.quantity} required />
                <Field
                  label="Preço unitário"
                  name={`price-${item.id}`}
                  type="number"
                  step=".01"
                  value={item.unitPrice}
                  required
                />
                <Field label="Desconto" name={`item-discount-${item.id}`} type="number" step=".01" value={item.discount} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <SaveButton saving={saving}>Salvar orçamento</SaveButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function OrderActions({ order, state, save, saving }: { order: Order; state: AppState; save: any; saving: boolean }) {
  const allowed = orderTransitions[order.status] || [],
    [lossWarning, setLossWarning] = useState<{ profit: number; margin: number } | null>(null);
  if (!allowed.length) return <span className="muted">Fluxo encerrado</span>;
  return (
    <details className="inline-details">
      <summary>Próxima ação</summary>
      <form
        className="popover-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget),
            status = s(f, "status") as any;
          try {
            let next;
            if (status === "concluido") {
              next = completeSale(state, order.id, n(f, "ads"));
              const result = financialBreakdown(next.orders.find((item: any) => item.id === order.id)!);
              if (result.calculatedProfit < 0 && !f.get("confirmLoss")) {
                setLossWarning({ profit: result.calculatedProfit, margin: result.margin });
                toast.error("Revise e confirme a venda com prejuízo antes de concluir.");
                return;
              }
            } else if (status === "devolvido") next = returnSale(state, order.id);
            else next = transitionOrder(state, order.id, status);
            if (await save(next, "order-status")) {
              setLossWarning(null);
              const resulting = next.orders.find((item: any) => item.id === order.id),
                message =
                  status === "concluido"
                    ? "Venda concluída"
                    : status === "devolvido"
                      ? "Devolução registrada"
                      : status === "aprovado" && resulting?.status === "pronto"
                        ? "Pedido aprovado e estoque separado"
                        : status === "aprovado" && resulting?.status === "producao"
                          ? "Pedido aprovado e produção planejada"
                          : "Pedido atualizado";
              toast.success(message);
            }
          } catch (err: any) {
            toast.error(err.message);
          }
        }}
      >
        <SelectField label="Próxima etapa" name="status" value={allowed[0]}>
          {allowed.map((x) => (
            <option key={x} value={x}>
              {statusLabel(x)}
            </option>
          ))}
        </SelectField>
        {allowed.includes("concluido") && (
          <Field label="Custo de anúncios desta venda" name="ads" type="number" step=".01" value={order.advertisingCost || 0} />
        )}{" "}
        {lossWarning && (
          <div className="sale-loss-warning">
            <AlertTriangle />
            <div>
              <b>Esta venda gera prejuízo de {money(Math.abs(lossWarning.profit))}</b>
              <small>Margem estimada: {lossWarning.margin.toFixed(1)}%. Confira custos, frete e anúncios.</small>
              <label>
                <input type="checkbox" name="confirmLoss" required /> Confirmo que desejo concluir esta venda com prejuízo.
              </label>
            </div>
          </div>
        )}
        <SaveButton saving={saving}>{lossWarning ? "Confirmar prejuízo e concluir" : "Confirmar ação"}</SaveButton>
      </form>
    </details>
  );
}

/** Orçamento para mandar ao cliente: texto para WhatsApp, impressão e link público revogável. */
function QuoteDialog({
  orderId,
  state,
  save,
  saving,
  linkEnabled,
  open,
  onClose,
}: {
  orderId: string;
  state: AppState;
  save: any;
  saving: boolean;
  linkEnabled: boolean;
  open: boolean;
  onClose: () => void;
}) {
  const order = state.orders.find((o) => o.id === orderId),
    quote = order && buildQuote(state, order),
    sheet = useRef<HTMLDivElement>(null),
    link = order?.quoteToken && typeof window !== "undefined" ? `${window.location.origin}/o/${order.quoteToken}` : "";
  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(done);
    } catch {
      toast.error("Não foi possível copiar automaticamente. Selecione o texto e copie.");
    }
  }
  function print() {
    const popup = window.open("", "_blank", "width=860,height=1000");
    if (!popup || !sheet.current)
      return toast.error("O navegador bloqueou a janela de impressão. Permita pop-ups para este site.");
    const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => node.outerHTML).join("");
    popup.document.write(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento ${quote?.number}</title>${styles}</head><body><main class="quote-page">${sheet.current.innerHTML}</main></body></html>`,
    );
    popup.document.close();
    setTimeout(() => popup.print(), 600);
  }
  async function toggleLink(enabled: boolean) {
    if (await save(setQuoteLink(state, orderId, enabled), enabled ? "quote-link-create" : "quote-link-revoke"))
      toast.success(enabled ? "Link criado" : "Link desativado. Quem tinha o endereço não consegue mais abrir.");
  }
  return (
    <Dialog
      open={open && Boolean(quote)}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogContent className="entity-dialog quote-dialog">
        <DialogHeader>
          <DialogTitle>Orçamento para o cliente</DialogTitle>
          <DialogDescription>Mostra só preços, prazo e condições. Nome e contato da empresa vêm de Parâmetros.</DialogDescription>
        </DialogHeader>
        {quote && (
          <>
            <div className="quote-preview" ref={sheet}>
              <QuoteView quote={quote} />
            </div>
            <div className="quote-actions">
              <Button type="button" onClick={() => copy(quoteText(quote), "Texto copiado. Cole no WhatsApp ou no e-mail.")}>
                <ClipboardList />
                Copiar texto
              </Button>
              <Button type="button" variant="outline" onClick={print}>
                <Printer />
                Imprimir ou salvar PDF
              </Button>
            </div>
            <div className="quote-link">
              <b>Link para o cliente</b>
              {!linkEnabled ? (
                <small>
                  O link público precisa do banco permanente (Turso). Enquanto os dados estiverem só no navegador, use Copiar
                  texto ou Imprimir.
                </small>
              ) : order?.quoteToken ? (
                <>
                  <div className="quote-link-row">
                    <Input readOnly value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do orçamento" />
                    <Button type="button" variant="outline" onClick={() => copy(link, "Link copiado")}>
                      Copiar link
                    </Button>
                  </div>
                  <small>
                    Qualquer pessoa com este link vê o orçamento, sem senha.{" "}
                    <button type="button" className="link-button" disabled={saving} onClick={() => toggleLink(false)}>
                      Desativar link
                    </button>
                  </small>
                </>
              ) : (
                <>
                  <small>Cria um endereço que o cliente abre no celular, sem senha. Você pode desativar quando quiser.</small>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => toggleLink(true)}>
                    Criar link
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
