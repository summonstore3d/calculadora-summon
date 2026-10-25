"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AppState, cents, localMonth, money, today, uid } from "@/lib/summon";
import { countsInResult, financeMonths, monthLabel } from "@/lib/finance";
import { cashSheet, dreSheet, expensesSheet, salesSheet, stockSheet, type Sheet } from "@/lib/export";
import {
  DataTable,
  Empty,
  Field,
  PageHead,
  SaveButton,
  Section,
  Stat,
  downloadCsv,
  n,
  s,
  statusLabel,
} from "@/components/app/shared";

export function MarketingPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const sales = state.orders.filter((o) => o.status === "concluido"),
    ads = sales.reduce((a, o) => a + o.advertisingCost, 0),
    attributed = sales.filter((o) => o.campaignId).reduce((a, o) => a + o.netRevenue, 0),
    newCustomerIds = new Set<string>();
  let newCount = 0;
  sales
    .slice()
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((o) => {
      if (o.customerId && !newCustomerIds.has(o.customerId)) {
        newCustomerIds.add(o.customerId);
        newCount++;
      }
    });
  return (
    <>
      <PageHead title="Marketing" description="Campanhas, mídia atribuída, CAC e retorno sobre anúncios." />
      <div className="stats-grid compact">
        <Stat label="Mídia atribuída" value={money(ads)} />
        <Stat label="CAC médio" value={money(newCount ? ads / newCount : 0)} />
        <Stat label="ROAS atribuído" value={(ads ? attributed / ads : 0).toFixed(2) + "x"} />
      </div>
      <Section title="Nova campanha">
        <form
          className="form-grid cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              campaign = {
                id: uid(),
                name: s(f, "name"),
                platform: s(f, "platform"),
                startDate: s(f, "startDate"),
                endDate: s(f, "endDate"),
                investment: n(f, "investment"),
                objective: s(f, "objective"),
                target: s(f, "target"),
                note: s(f, "note"),
                status: "active" as const,
              };
            if (await save({ ...state, campaigns: [...state.campaigns, campaign] }, "campaign-create")) {
              toast.success("Campanha cadastrada");
              e.currentTarget.reset();
            }
          }}
        >
          <Field label="Nome" name="name" required />
          <Field label="Plataforma" name="platform" required />
          <Field label="Início" name="startDate" type="date" value={today()} />
          <Field label="Fim" name="endDate" type="date" />
          <Field label="Investimento" name="investment" type="number" step=".01" />
          <Field label="Objetivo" name="objective" />
          <Field label="Produto ou público" name="target" />
          <Field label="Observação" name="note" />
          <SaveButton saving={saving}>Cadastrar campanha</SaveButton>
        </form>
      </Section>
      <div className="campaign-grid">
        {state.campaigns.map((c) => {
          const orders = sales.filter((o) => o.campaignId === c.id),
            revenue = orders.reduce((a, o) => a + o.netRevenue, 0),
            allocated = orders.reduce((a, o) => a + o.advertisingCost, 0);
          return (
            <Card key={c.id}>
              <CardContent>
                <div className="campaign-head">
                  <div>
                    <small>{c.platform}</small>
                    <b>{c.name}</b>
                  </div>
                  <Badge>{statusLabel(c.status)}</Badge>
                </div>
                <div className="price-grid">
                  <div>
                    <span>Investimento</span>
                    <b>{money(c.investment)}</b>
                  </div>
                  <div>
                    <span>Atribuído</span>
                    <b>{money(allocated)}</b>
                  </div>
                  <div>
                    <span>Receita</span>
                    <b>{money(revenue)}</b>
                  </div>
                  <div>
                    <span>ROAS</span>
                    <b>{(allocated ? revenue / allocated : 0).toFixed(2)}x</b>
                  </div>
                </div>
                <Progress value={c.investment ? Math.min(100, (allocated / c.investment) * 100) : 0} />
                <small>{money(Math.max(0, c.investment - allocated))} ainda não atribuído</small>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

export function ReportsPage({ state }: { state: AppState }) {
  const [period, setPeriod] = useState("all"),
    sales = state.orders.filter(
      (o) => o.status === "concluido" && (period === "all" || localMonth(o.completedAt || o.createdAt) === period),
    ),
    expenses = state.expenses.filter((e) => countsInResult(e) && (period === "all" || localMonth(e.dueDate) === period)),
    items = sales.flatMap((o) => o.items),
    byProduct = new Map<string, { name: string; qty: number; revenue: number; profit: number }>();
  items.forEach((i) => {
    const x = byProduct.get(i.productId) || { name: i.productName, qty: 0, revenue: 0, profit: 0 };
    x.qty += i.quantity;
    x.revenue += i.revenue;
    x.profit += i.profit;
    byProduct.set(i.productId, x);
  });
  const months = [
      ...new Set([
        ...state.orders.map((o) => localMonth(o.completedAt || o.createdAt)),
        ...state.expenses.map((e) => localMonth(e.paidAt || e.dueDate)),
      ]),
    ]
      .sort()
      .reverse(),
    revenueTotal = sales.reduce((a, o) => a + o.netRevenue, 0),
    operationalProfit = sales.reduce((a, o) => a + o.profit, 0),
    expenseTotal = expenses.reduce((a, e) => a + e.amount, 0),
    netProfit = operationalProfit - expenseTotal,
    netMargin = revenueTotal ? (netProfit / revenueTotal) * 100 : 0;
  function csv() {
    downloadCsv(`relatorio-operacional${period === "all" ? "" : `-${period}`}.csv`, [
      ["Produto", "Quantidade", "Receita", "Lucro", "Margem (%)"],
      ...[...byProduct.values()].map(
        (x) => [x.name, x.qty, x.revenue, x.profit, x.revenue ? cents((x.profit / x.revenue) * 100) : 0] as (string | number)[],
      ),
    ]);
  }
  return (
    <>
      <PageHead
        title="Relatórios"
        description="Resultado realizado, produção, estoque e rentabilidade."
        action={
          <div className="actions">
            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
              <option value="all">Todo o período</option>
              {months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <Button variant="outline" onClick={csv}>
              <Download />
              Exportar CSV
            </Button>
          </div>
        }
      />
      <div className="stats-grid">
        <Stat label="Receita líquida" value={money(revenueTotal)} />
        <Stat label="Margem de contribuição" value={money(operationalProfit)} tone="green" />
        <Stat label="Despesas" value={money(expenseTotal)} tone="red" />
        <Stat
          label="Resultado líquido"
          value={money(netProfit)}
          detail={`${netMargin.toFixed(1)}% de margem`}
          tone={netProfit >= 0 ? "green" : "red"}
        />
      </div>
      <AccountantExport state={state} />
      <Section title="Rentabilidade por produto">
        {byProduct.size ? (
          <DataTable headers={["Produto", "Vendidas", "Receita", "Lucro", "Margem"]}>
            {[...byProduct.values()]
              .sort((a, b) => b.profit - a.profit)
              .map((x) => (
                <tr key={x.name}>
                  <td>
                    <b>{x.name}</b>
                  </td>
                  <td>{x.qty}</td>
                  <td>{money(x.revenue)}</td>
                  <td className={x.profit >= 0 ? "positive" : "negative"}>{money(x.profit)}</td>
                  <td>{(x.revenue ? (x.profit / x.revenue) * 100 : 0).toFixed(1)}%</td>
                </tr>
              ))}
          </DataTable>
        ) : (
          <Empty title="Sem dados no período" description="Conclua vendas para gerar os indicadores." />
        )}
      </Section>
    </>
  );
}

/** Planilhas do mês para o contador ou para conferir no Excel. */
function AccountantExport({ state }: { state: AppState }) {
  const months = financeMonths(state),
    current = localMonth(today()),
    // A lista inclui meses futuros (parcelas e recorrências); começa pelo mês atual.
    [month, setMonth] = useState(months.includes(current) ? current : months[0]);
  const sheets: [string, string, () => Sheet][] = [
    ["Vendas", "Uma linha por item vendido, com receita, taxas, custo e lucro", () => salesSheet(state, month)],
    ["Resultado (DRE)", "Receita, deduções, despesas e lucro do mês", () => dreSheet(state, month)],
    ["Contas a pagar", "Todas as contas com vencimento no mês, pagas ou não", () => expensesSheet(state, month)],
    ["Extrato do caixa", "Tudo que entrou e saiu de fato no mês", () => cashSheet(state, month)],
    ["Estoque valorizado", "Filamento, insumos e peças prontas hoje, ao custo", () => stockSheet(state)],
  ];
  return (
    <Section title="Planilhas para o contador" description="Abrem direto no Excel, Google Sheets ou LibreOffice.">
      <div className="export-month">
        <label>
          <span>Mês</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="export-grid">
        {sheets.map(([title, detail, build]) => (
          <button
            key={title}
            onClick={() => {
              const sheet = build();
              if (sheet.rows.length <= 1)
                return toast.info(`Nada em ${title.toLowerCase()} para ${monthLabel(month).toLowerCase()}.`);
              downloadCsv(sheet.filename, sheet.rows);
            }}
          >
            <Download />
            <span>
              <b>{title}</b>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </div>
    </Section>
  );
}
