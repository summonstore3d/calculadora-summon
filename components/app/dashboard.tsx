"use client";

import { useMemo, useState } from "react";
import { Activity, AlertTriangle, ChevronRight, Eye, Factory, Printer } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AppState, financialBreakdown, localDay, localMonth, money, normalize, today } from "@/lib/summon";
import { PageId } from "@/lib/navigation";
import { buildDashboardAnalytics } from "@/lib/dashboard";
import { monthLabel, monthlyDre } from "@/lib/finance";
import { dailySummary, type DailyItem } from "@/lib/daily";
import { Empty, PageHead, Section, Stat, dateLabel, statusLabel } from "@/components/app/shared";
import { FinancialTraceDialog } from "@/components/app/sales";

/** O que pede atenção hoje, do mais urgente ao informativo. Cada linha abre o registro ou a tela certa. */
export function DailySummaryPanel({
  summary,
  navigate,
  navigateRecord,
}: {
  summary: { items: DailyItem[]; urgent: number };
  navigate: (page: any) => void;
  navigateRecord: (page: any, record?: string) => void;
}) {
  return (
    <section className="daily-summary" aria-labelledby="daily-summary-title">
      <div className="daily-summary-head">
        <span>
          <b id="daily-summary-title">Resumo do dia</b>
          <small>
            {summary.items.length ? "Do mais urgente ao informativo. Toque para abrir." : "Nada pedindo atenção hoje."}
          </small>
        </span>
        <Badge variant={summary.urgent ? "destructive" : "secondary"}>
          {summary.urgent ? `${summary.urgent} urgente${summary.urgent === 1 ? "" : "s"}` : "Tudo em dia"}
        </Badge>
      </div>
      {summary.items.length > 0 && (
        <ul className="daily-summary-list">
          {summary.items.map((item) => (
            <li key={item.key}>
              <button
                className={`daily-${item.tone}`}
                onClick={() => (item.record ? navigateRecord(item.page, item.record) : navigate(item.page))}
              >
                <i aria-hidden="true" />
                <span>
                  <b>{item.title}</b>
                  <small>{item.detail}</small>
                </span>
                {item.amount ? <strong>{money(item.amount)}</strong> : <strong />}
                <ChevronRight />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Metas do mês (cadastradas em Parâmetros) contra o realizado. */
export function GoalsPanel({ state, navigate }: { state: AppState; navigate: (page: string) => void }) {
  const month = localMonth(today()),
    goal = state.goals.find((g) => g.month === month);
  if (!goal)
    return (
      <div className="goals-empty">
        <span>Nenhuma meta para {monthLabel(month).toLowerCase()}.</span>
        <Button size="sm" variant="outline" onClick={() => navigate("settings")}>
          Definir metas
        </Button>
      </div>
    );
  const dre = monthlyDre(state, month),
    produced = state.productionOrders
      .filter((o) => o.status === "concluida" && localMonth(o.completedAt || o.createdAt) === month)
      .reduce((a, o) => a + o.approvedQuantity, 0);
  const [y, m] = month.split("-").map(Number),
    daysInMonth = new Date(y, m, 0).getDate(),
    elapsed = Number(today().slice(8, 10)),
    pace = elapsed / daysInMonth;
  const items = [
    { label: "Faturamento", target: goal.revenue, actual: dre.net, format: money },
    { label: "Lucro líquido", target: goal.profit, actual: dre.result, format: money },
    { label: "Margem líquida", target: goal.margin, actual: dre.margin, format: (v: number) => `${v.toFixed(1)}%`, isRate: true },
    { label: "Vendas", target: goal.sales, actual: dre.orders, format: (v: number) => `${v}` },
    { label: "Peças produzidas", target: goal.production, actual: produced, format: (v: number) => `${v}` },
  ].filter((item) => item.target > 0);
  if (!items.length) return null;
  return (
    <section className="goals-panel" aria-labelledby="goals-title">
      <div className="goals-head">
        <b id="goals-title">Metas de {monthLabel(month).toLowerCase()}</b>
        <small>
          Dia {elapsed} de {daysInMonth} · o traço marca onde deveria estar hoje
        </small>
      </div>
      <div className="goals-grid">
        {items.map((item) => {
          const ratio = item.target ? item.actual / item.target : 0,
            expected = item.isRate ? 1 : pace,
            tone = ratio >= expected ? "good" : ratio >= expected * 0.8 ? "warn" : "bad";
          return (
            <div key={item.label} className={`goal goal-${tone}`}>
              <span>{item.label}</span>
              <b>{item.format(item.actual)}</b>
              <small>
                meta {item.format(item.target)} · {Math.round(ratio * 100)}%
              </small>
              <div className="goal-bar" aria-hidden="true">
                <i style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }} />
                {!item.isRate && <em style={{ left: `${pace * 100}%` }} />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Dashboard({
  state,
  navigate,
  navigateRecord,
}: {
  state: AppState;
  navigate: (page: string) => void;
  navigateRecord: (page: PageId, record?: string) => void;
}) {
  const [filters, setFilters] = useState<any>({ period: "month", productId: "", category: "", universe: "", machineId: "" }),
    [traceOpen, setTraceOpen] = useState(false),
    [detail, setDetail] = useState<string | null>(null),
    analytics = useMemo(() => buildDashboardAnalytics(state, filters), [state, filters]);
  const categories = [...new Set(state.products.map((product) => product.category).filter(Boolean))].sort(),
    universes = [...new Set(state.products.map((product) => product.universe).filter(Boolean))].sort(),
    setFilter = (key: string, value: string) => setFilters((current: any) => ({ ...current, [key]: value }));
  const productMatches = (productId: string) => {
    const product = state.products.find((item) => item.id === productId);
    return (
      Boolean(product) &&
      (!filters.productId || productId === filters.productId) &&
      (!filters.category || normalize(product!.category) === normalize(filters.category)) &&
      (!filters.universe || normalize(product!.universe) === normalize(filters.universe))
    );
  };
  const openProduction = state.productionOrders.filter(
      (order) =>
        !["concluida", "cancelada"].includes(order.status) &&
        productMatches(order.productId) &&
        (!filters.machineId || order.machineId === filters.machineId),
    ),
    completedProduction = state.productionOrders.filter(
      (order) =>
        order.status === "concluida" &&
        productMatches(order.productId) &&
        (!filters.machineId || order.machineId === filters.machineId) &&
        new Date(order.completedAt || order.createdAt) >= analytics.range.start &&
        new Date(order.completedAt || order.createdAt) <= analytics.range.end,
    );
  const stages = [
      { id: "planejada", label: "Planejadas", tone: "neutral" },
      { id: "aguardando_material", label: "Bloqueadas", tone: "warning" },
      { id: "fila", label: "Na fila", tone: "blue" },
      { id: "imprimindo", label: "Imprimindo", tone: "violet" },
      { id: "acabamento", label: "Acabamento", tone: "cyan" },
    ],
    stageData = stages.map((stage) => {
      const orders = openProduction.filter((order) => order.status === stage.id);
      return { ...stage, orders, pieces: orders.reduce((total, order) => total + order.plannedQuantity, 0) };
    });
  const blocked = openProduction.filter((order) =>
      order.plannedConsumption.some(
        (part) => (state.materials.find((material) => material.id === part.materialId)?.stockGrams || 0) < part.weightGrams,
      ),
    ),
    overdue = openProduction
      .filter((order) => Boolean(order.dueDate) && order.dueDate! < today())
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || "")),
    nextOrders = openProduction
      .filter((order) => order.dueDate)
      .sort((a, b) => (a.dueDate || "").localeCompare(b.dueDate || ""))
      .slice(0, 6);
  const activeMachines = state.machines.filter((machine) => machine.status === "active"),
    printingOrders = openProduction.filter((order) => order.status === "imprimindo"),
    busyMachineIds = new Set(printingOrders.map((order) => order.machineId).filter(Boolean)),
    unassignedPrinting = printingOrders.filter((order) => !order.machineId),
    utilization = activeMachines.length ? (busyMachineIds.size / activeMachines.length) * 100 : 0;
  const machineRows = activeMachines
    .map((machine) => {
      const current = printingOrders.find((order) => order.machineId === machine.id),
        queued = openProduction.filter((order) => order.machineId === machine.id && order.status === "fila");
      return { machine, current, queued };
    })
    .sort((a, b) => Number(Boolean(b.current)) - Number(Boolean(a.current)));
  const productionSeries = [
    ...completedProduction
      .reduce((map, order) => {
        const date = new Date(order.completedAt || order.createdAt),
          key = localDay(date),
          current = map.get(key) || {
            key,
            name: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
            aprovadas: 0,
            perdidas: 0,
          };
        current.aprovadas += order.approvedQuantity;
        current.perdidas += order.lostQuantity;
        map.set(key, current);
        return map;
      }, new Map<string, any>())
      .values(),
  ].sort((a, b) => a.key.localeCompare(b.key));
  const approved = completedProduction.reduce((total, order) => total + order.approvedQuantity, 0),
    lost = completedProduction.reduce((total, order) => total + order.lostQuantity, 0),
    successRate = approved + lost ? (approved / (approved + lost)) * 100 : 100,
    machineHours = completedProduction.reduce((total, order) => total + order.actualHours, 0),
    financialWarnings = analytics.orders.flatMap((order) =>
      financialBreakdown(order).anomalies.map((message) => ({ order, message })),
    ),
    detailContent = dashboardDetail(detail, analytics, state);
  const summary = dailySummary(state);
  return (
    <>
      <PageHead
        title="Dashboard da farm"
        description="Situação das máquinas, fluxo de produção, prazos e materiais críticos."
        action={
          <Button onClick={() => navigate("production")}>
            <Factory />
            Abrir Kanban
          </Button>
        }
      />
      <div className="farm-filters" aria-label="Filtros da operação">
        <label>
          <span>Período concluído</span>
          <select value={filters.period} onChange={(e) => setFilter("period", e.target.value)}>
            <option value="today">Hoje</option>
            <option value="week">Últimos 7 dias</option>
            <option value="month">Este mês</option>
            <option value="quarter">Este trimestre</option>
            <option value="year">Este ano</option>
            <option value="custom">Personalizado</option>
          </select>
        </label>
        {filters.period === "custom" && (
          <>
            <label>
              <span>De</span>
              <Input type="date" value={filters.start || ""} onChange={(e) => setFilter("start", e.target.value)} />
            </label>
            <label>
              <span>Até</span>
              <Input type="date" value={filters.end || ""} onChange={(e) => setFilter("end", e.target.value)} />
            </label>
          </>
        )}
        <label>
          <span>Máquina</span>
          <select value={filters.machineId} onChange={(e) => setFilter("machineId", e.target.value)}>
            <option value="">Todas</option>
            {activeMachines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Produto</span>
          <select value={filters.productId} onChange={(e) => setFilter("productId", e.target.value)}>
            <option value="">Todos</option>
            {state.products
              .filter((product) => product.status !== "archived")
              .map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <select value={filters.category} onChange={(e) => setFilter("category", e.target.value)}>
            <option value="">Todas</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Universo</span>
          <select value={filters.universe} onChange={(e) => setFilter("universe", e.target.value)}>
            <option value="">Todos</option>
            {universes.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <Button
          variant="ghost"
          onClick={() => setFilters({ period: "month", productId: "", category: "", universe: "", machineId: "" })}
        >
          Limpar
        </Button>
      </div>
      <div className="farm-summary">
        <button onClick={() => navigate("machines")}>
          <span>Máquinas imprimindo</span>
          <strong>
            {busyMachineIds.size}
            <small>/{activeMachines.length}</small>
          </strong>
          <small>{utilization.toFixed(0)}% em uso agora</small>
        </button>
        <button onClick={() => navigate("production")}>
          <span>Peças planejadas</span>
          <strong>
            {stageData
              .filter((stage) => ["planejada", "aguardando_material"].includes(stage.id))
              .reduce((total, stage) => total + stage.pieces, 0)}
          </strong>
          <small>
            {stageData
              .filter((stage) => ["planejada", "aguardando_material"].includes(stage.id))
              .reduce((total, stage) => total + stage.orders.length, 0)}{" "}
            ordens
          </small>
        </button>
        <button onClick={() => navigate("production")}>
          <span>Peças na fila</span>
          <strong>{stageData.find((stage) => stage.id === "fila")?.pieces || 0}</strong>
          <small>{stageData.find((stage) => stage.id === "fila")?.orders.length || 0} ordens aguardando</small>
        </button>
        <button onClick={() => navigate("production")}>
          <span>Produzidas no período</span>
          <strong>{approved}</strong>
          <small>{machineHours.toFixed(1)} horas de máquina</small>
        </button>
        <button className={lost ? "warning" : ""} onClick={() => navigate("production")}>
          <span>Taxa de sucesso</span>
          <strong>{successRate.toFixed(1)}%</strong>
          <small>{lost} peças perdidas</small>
        </button>
        <button className={overdue.length ? "danger" : ""} onClick={() => navigate("production")}>
          <span>Ordens atrasadas</span>
          <strong>{overdue.length}</strong>
          <small>{blocked.length} com falta de material</small>
        </button>
      </div>
      <GoalsPanel state={state} navigate={navigate} />
      <DailySummaryPanel summary={summary} navigate={navigate} navigateRecord={navigateRecord} />
      <div className="farm-dashboard-grid">
        <Section
          title="Máquinas agora"
          description={`${busyMachineIds.size} imprimindo · ${Math.max(0, activeMachines.length - busyMachineIds.size)} disponíveis`}
        >
          {machineRows.length ? (
            <div className="farm-machines">
              {machineRows.map(({ machine, current, queued }) => (
                <button
                  className={current ? "is-printing" : ""}
                  key={machine.id}
                  onClick={() => (current ? navigateRecord("production", current.number) : navigate("machines"))}
                >
                  <div className="farm-machine-icon">
                    <Printer />
                  </div>
                  <span>
                    <b>{machine.name}</b>
                    <small>{machine.model || "Modelo não informado"}</small>
                  </span>
                  <Badge variant={current ? "secondary" : "outline"}>{current ? "Imprimindo" : "Disponível"}</Badge>
                  {current && (
                    <p>
                      <b>{state.products.find((product) => product.id === current.productId)?.name}</b>
                      <small>
                        {current.number} · {current.plannedQuantity} un
                      </small>
                    </p>
                  )}
                  {!current && (
                    <p>
                      <span>
                        {queued.length} ordem{queued.length === 1 ? "" : "s"} na fila
                      </span>
                      <small>{machine.accumulatedHours.toFixed(1)} h acumuladas</small>
                    </p>
                  )}
                  <ChevronRight className="farm-row-arrow" />
                </button>
              ))}
            </div>
          ) : (
            <Empty title="Nenhuma máquina ativa" description="Cadastre as impressoras para acompanhar a capacidade da farm." />
          )}
        </Section>
        <Section
          title="Fluxo atual"
          description={`${openProduction.length} ordens abertas · ${openProduction.reduce((total, order) => total + order.plannedQuantity, 0)} peças`}
        >
          <div className="farm-stages">
            {stageData.map((stage) => (
              <button key={stage.id} className={`stage-${stage.tone}`} onClick={() => navigate("production")}>
                <i />
                <span>
                  <b>{stage.label}</b>
                  <small>{stage.orders.length} ordens</small>
                </span>
                <strong>
                  {stage.pieces}
                  <small> peças</small>
                </strong>
              </button>
            ))}
          </div>
          {unassignedPrinting.length > 0 && (
            <div className="farm-inline-alert">
              <AlertTriangle />
              <span>
                <b>{unassignedPrinting.length} impressão sem máquina vinculada</b>
                <small>Vincule a máquina para medir capacidade e horas corretamente.</small>
              </span>
            </div>
          )}
        </Section>
      </div>
      <div className="farm-dashboard-grid">
        <Section
          title="Produção concluída"
          description={`${dateLabel(analytics.range.start.toISOString())} a ${dateLabel(analytics.range.end.toISOString())}`}
        >
          {productionSeries.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={productionSeries}>
                  <defs>
                    <linearGradient id="approvedProduction" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="aprovadas"
                    name="Aprovadas"
                    stroke="#2563eb"
                    fill="url(#approvedProduction)"
                    strokeWidth={2}
                  />
                  <Area type="monotone" dataKey="perdidas" name="Perdidas" stroke="#dc2626" fill="transparent" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <Empty
              title="Nenhuma produção concluída"
              description="As peças aprovadas e perdidas aparecerão aqui após os apontamentos."
            />
          )}
        </Section>
        <Section title="Próximos prazos" description="Ordens abertas ordenadas pelo prazo mais próximo.">
          {nextOrders.length ? (
            <div className="farm-deadlines">
              {nextOrders.map((order) => {
                const product = state.products.find((item) => item.id === order.productId),
                  late = Boolean(order.dueDate && order.dueDate < today());
                return (
                  <button key={order.id} onClick={() => navigateRecord("production", order.number)}>
                    <span>
                      <b>{product?.name || "Produto"}</b>
                      <small>
                        {order.number} · {order.plannedQuantity} un · {statusLabel(order.status)}
                      </small>
                    </span>
                    <strong className={late ? "negative" : ""}>{late ? "Atrasada" : dateLabel(order.dueDate)}</strong>
                    <ChevronRight />
                  </button>
                );
              })}
            </div>
          ) : (
            <Empty title="Nenhum prazo pendente" description="As ordens com data prevista aparecerão aqui." />
          )}
        </Section>
      </div>
      <Section title="Materiais para a fila" description="Necessidade considerando estoque mínimo e todas as ordens abertas.">
        {analytics.purchaseForecast.length ? (
          <div className="purchase-forecast">
            {analytics.purchaseForecast.slice(0, 8).map((material) => (
              <div key={material.id}>
                <span>
                  <b>{material.name}</b>
                  <small>
                    {material.brand} · saldo {(material.stockGrams / 1000).toFixed(3)} kg · demanda{" "}
                    {(material.plannedGrams / 1000).toFixed(3)} kg
                  </small>
                </span>
                <strong>Faltam {(material.neededGrams / 1000).toFixed(3)} kg</strong>
                <Button size="sm" variant="outline" onClick={() => navigateRecord("materials", `entrada:${material.id}`)}>
                  Registrar entrada
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="dashboard-ok">
            <Activity />
            <span>
              <b>Materiais suficientes para a fila</b>
              <small>Não há necessidade de compra considerando as ordens atuais.</small>
            </span>
          </div>
        )}
      </Section>
      <div className="dashboard-secondary-title">
        <span>
          <b>Visão comercial</b>
          <small>Indicadores de apoio; a operação da farm permanece como foco principal.</small>
        </span>
        <Button variant="ghost" onClick={() => navigate("reports")}>
          Abrir relatórios
        </Button>
      </div>
      <div className="stats-grid">
        <Stat
          label="Receita líquida"
          value={money(analytics.netRevenue)}
          detail={`${analytics.variation >= 0 ? "+" : ""}${analytics.variation.toFixed(1)}% vs. período anterior`}
          onClick={() => setDetail("sales")}
        />
        <Stat
          label="Lucro líquido"
          value={money(analytics.operatingProfit)}
          detail={`${analytics.margin.toFixed(1)}% de margem`}
          tone={analytics.operatingProfit >= 0 ? "green" : "red"}
          onClick={() => setTraceOpen(true)}
        />
        <Stat
          label="Pedidos em aberto"
          value={String(analytics.openOrders.length)}
          detail="acompanhar vendas"
          onClick={() => navigate("orders")}
        />
        <Stat
          label="Capital em estoque"
          value={money(analytics.inventoryCapital)}
          detail={`${money(analytics.materialCapital)} insumos · ${money(analytics.productCapital)} produtos`}
          tone="violet"
          onClick={() => setDetail("inventory")}
        />
      </div>
      {financialWarnings.length > 0 && (
        <button className="financial-alert" onClick={() => setTraceOpen(true)}>
          <AlertTriangle />
          <span>
            <b>
              {financialWarnings.length} alerta{financialWarnings.length > 1 ? "s" : ""} financeiro
              {financialWarnings.length > 1 ? "s" : ""}
            </b>
            <small>Revise custos acima da receita, margens negativas ou divergências históricas.</small>
          </span>
          <Eye />
        </button>
      )}
      <FinancialTraceDialog
        open={traceOpen}
        onOpenChange={setTraceOpen}
        orders={analytics.orders}
        expenses={analytics.operatingExpenses}
        state={state}
      />
      <DashboardDetailDialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={detailContent.title}
        description={detailContent.description}
        rows={detailContent.rows}
      />
    </>
  );
}

export function dashboardDetail(type: string | null, analytics: any, state: AppState) {
  if (type === "cash")
    return {
      title: "Movimentação de caixa",
      description: "Recebimentos registrados dentro do período selecionado.",
      rows: analytics.payments.map((payment: any) => {
        const order = state.orders.find((item) => item.id === payment.orderId);
        return {
          id: payment.id,
          primary: order?.number || "Pedido",
          secondary: `${payment.method || "Forma não informada"} · ${dateLabel(payment.receivedAt || payment.dueDate)}`,
          value: payment.received,
          meta: statusLabel(payment.status),
        };
      }),
    };
  if (type === "inventory")
    return {
      title: "Capital em estoque",
      description: "Valor contábil dos insumos e lotes de produtos disponíveis.",
      rows: [
        ...state.materials
          .filter((material) => material.status === "active" && material.stockGrams > 0)
          .map((material) => ({
            id: material.id,
            primary: `${material.type} ${material.color}`,
            secondary: `${material.brand} · ${(material.stockGrams / 1000).toFixed(3)} kg`,
            value: (material.stockGrams / 1000) * material.averageCost,
            meta: "Insumo",
          })),
        ...state.lots
          .filter((lot) => lot.balance > 0)
          .map((lot) => ({
            id: lot.id,
            primary: state.products.find((product) => product.id === lot.productId)?.name || lot.code,
            secondary: `${lot.code} · ${lot.balance} un`,
            value: lot.balance * lot.unitCost,
            meta: "Produto",
          })),
      ],
    };
  if (type === "open-orders")
    return {
      title: "Pedidos em aberto",
      description: "Pedidos que ainda exigem uma ação operacional.",
      rows: analytics.openOrders.map((order: any) => ({
        id: order.id,
        primary: order.number,
        secondary: order.customerName,
        value: order.netRevenue,
        meta: statusLabel(order.status),
      })),
    };
  if (type === "production")
    return {
      title: "Fila de produção",
      description: "Ordens planejadas, aguardando material ou na fila.",
      rows: analytics.productionRows,
    };
  if (type === "overdue")
    return {
      title: "Produções atrasadas",
      description: "Ordens abertas com prazo anterior a hoje.",
      rows: analytics.overdueProduction.map((order: any) => ({
        id: order.id,
        primary: order.number,
        secondary: state.products.find((product) => product.id === order.productId)?.name || "Produto",
        value: order.plannedQuantity,
        meta: dateLabel(order.dueDate),
      })),
    };
  if (type === "stock-alerts")
    return {
      title: "Alertas de estoque",
      description: "Insumos e produtos no estoque mínimo ou abaixo dele.",
      rows: [
        ...analytics.lowMaterials.map((material: any) => ({
          id: material.id,
          primary: `${material.type} ${material.color}`,
          secondary: material.brand,
          value: material.stockGrams / 1000,
          meta: "kg",
        })),
        ...analytics.lowProducts.map((product: any) => ({
          id: product.id,
          primary: product.name,
          secondary: product.sku,
          value: product.readyStock,
          meta: "un",
        })),
      ],
    };
  return {
    title: "Vendas do período",
    description: "Pedidos concluídos que compõem os indicadores atuais.",
    rows: analytics.orderRows,
  };
}

export function DashboardDetailDialog({
  open,
  onOpenChange,
  title,
  description,
  rows,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  rows: any[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="dashboard-detail-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {rows.length ? (
          <div className="dashboard-detail-list">
            {rows.map((row) => (
              <div key={row.id}>
                <span>
                  <b>{row.primary}</b>
                  <small>{row.secondary}</small>
                </span>
                {row.value !== undefined && (
                  <strong>
                    {row.meta === "kg" ? `${row.value.toFixed(3)} kg` : row.meta === "un" ? `${row.value} un` : money(row.value)}
                  </strong>
                )}
                {row.meta && !["kg", "un"].includes(row.meta) && <Badge variant="outline">{row.meta}</Badge>}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="Nenhum registro encontrado" description="Não existem registros para este detalhamento e período." />
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
