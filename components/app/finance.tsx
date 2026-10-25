"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AppState, Expense, Payment, cents, localDay, localMonth, money, today } from "@/lib/summon";
import {
  EXPENSE_CATEGORIES,
  MAINTENANCE_CATEGORY,
  PURCHASE_CATEGORY,
  accountsSummary,
  addDays,
  addMonths as addMonthsFinance,
  cancelExpense,
  cashLedger,
  createExpenses,
  financeMonths,
  monthLabel,
  monthlyDre,
  openingBalance,
  payExpense,
  receiptsOf,
  receivePayment,
  remainingOf,
  updateExpense,
} from "@/lib/finance";
import {
  DataTable,
  Empty,
  Field,
  PageHead,
  SaveButton,
  Section,
  Stat,
  dateLabel,
  downloadCsv,
  n,
  s,
  statusLabel,
} from "@/components/app/shared";

export const previousMonthOf = (month: string) => addDays(`${month}-01`, -1).slice(0, 7);

export const signedMoney = (value: number) => (value < 0 ? `− ${money(Math.abs(value))}` : money(value));

export function dueState(dueDate: string, reference: string) {
  if (dueDate < reference) return { label: "Vencida", tone: "overdue" };
  if (dueDate === reference) return { label: "Vence hoje", tone: "today" };
  if (dueDate <= addDays(reference, 7)) return { label: "Vence esta semana", tone: "week" };
  return { label: "Em aberto", tone: "open" };
}

export function FinancePage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const reference = today(),
    [month, setMonth] = useState(localMonth(reference)),
    [tab, setTab] = useState<"overview" | "payables" | "receivables" | "ledger">("overview"),
    [payablesView, setPayablesView] = useState<"open" | "month">("open");
  const [expenseDialog, setExpenseDialog] = useState<{ id?: string } | null>(null),
    [payId, setPayId] = useState<string | null>(null),
    [receiveId, setReceiveId] = useState<string | null>(null),
    [cancelId, setCancelId] = useState<string | null>(null);
  const months = useMemo(() => financeMonths(state), [state]),
    ledger = useMemo(() => cashLedger(state, month), [state, month]),
    opening = useMemo(() => openingBalance(state, month), [state, month]);
  const inflow = cents(ledger.filter((e) => e.kind === "in").reduce((a, e) => a + e.amount, 0)),
    outflow = cents(ledger.filter((e) => e.kind === "out").reduce((a, e) => a + e.amount, 0)),
    dre = useMemo(() => monthlyDre(state, month), [state, month]),
    previous = useMemo(() => monthlyDre(state, previousMonthOf(month)), [state, month]),
    summary = accountsSummary(state, reference);
  const openPayables = state.expenses.filter((e) => e.status === "pendente").sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    monthPayables = state.expenses
      .filter((e) => localMonth(e.dueDate) === month || localMonth(e.paidAt) === month)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    payables = payablesView === "open" ? openPayables : monthPayables;
  const openReceivables = state.payments
    .filter((p) => (p.status === "pendente" || p.status === "parcial") && remainingOf(p) > 0)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const cancelTarget = state.expenses.find((e) => e.id === cancelId);
  let running = opening;
  const ledgerRows = ledger.map((entry) => {
    running = cents(running + (entry.kind === "in" ? entry.amount : -entry.amount));
    return { entry, balance: running };
  });
  const closing = cents(opening + inflow - outflow);
  const tabs = [
    ["overview", "Visão geral"],
    ["payables", `A pagar${openPayables.length ? ` · ${openPayables.length}` : ""}`],
    ["receivables", `A receber${openReceivables.length ? ` · ${openReceivables.length}` : ""}`],
    ["ledger", "Extrato"],
  ] as const;
  function exportLedger() {
    downloadCsv(`extrato-${month}.csv`, [
      ["Data", "Descrição", "Categoria", "Entrada", "Saída", "Saldo"],
      ["", `Saldo inicial de ${monthLabel(month)}`, "", "", "", opening],
      ...ledgerRows.map(
        ({ entry, balance }) =>
          [
            dateLabel(entry.date),
            entry.description,
            entry.category,
            entry.kind === "in" ? entry.amount : "",
            entry.kind === "out" ? entry.amount : "",
            balance,
          ] as (string | number)[],
      ),
    ]);
  }
  function exportDre() {
    downloadCsv(`resultado-${month}.csv`, [
      ["Linha", monthLabel(month), monthLabel(previousMonthOf(month))],
      ...dre.lines.map(
        (line) => [line.label, line.value, previous.lines.find((x) => x.key === line.key)?.value ?? 0] as (string | number)[],
      ),
    ]);
  }
  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      if (await save(cancelExpense(state, cancelTarget.id), "expense-cancel")) toast.success("Conta cancelada");
    } catch (error: any) {
      toast.error(error.message);
    }
    setCancelId(null);
  }
  return (
    <>
      <PageHead
        title="Financeiro"
        description="Entradas, saídas, contas a pagar e a receber, e o resultado de cada mês."
        action={
          <div className="finance-head-actions">
            <label className="finance-month">
              <span>Mês</span>
              <select value={month} onChange={(e) => setMonth(e.target.value)}>
                {months.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => setExpenseDialog({})}>
              <Plus />
              Nova conta a pagar
            </Button>
          </div>
        }
      />
      <div className="finance-tabs" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <>
          <div className="stats-grid">
            <Stat label={`Entradas · ${monthLabel(month)}`} value={money(inflow)} detail="Recebimentos de vendas" tone="green" />
            <Stat label="Saídas" value={money(outflow)} detail="Contas pagas, compras, frete e anúncios" tone="red" />
            <Stat
              label="Saldo do mês"
              value={signedMoney(cents(inflow - outflow))}
              detail={`Caixa acumulado ${signedMoney(closing)}`}
              tone={inflow - outflow >= 0 ? "green" : "red"}
              onClick={() => setTab("ledger")}
            />
            <Stat
              label="Lucro líquido"
              value={signedMoney(dre.result)}
              detail={`${dre.margin.toFixed(1)}% da receita líquida`}
              tone={dre.result >= 0 ? "violet" : "red"}
            />
          </div>
          <div className="finance-accounts">
            <button className="finance-account" onClick={() => setTab("receivables")}>
              <span>A receber</span>
              <b>{money(summary.receivable)}</b>
              <small className={summary.receivableOverdue.length ? "tone-overdue" : ""}>
                {summary.receivableOverdue.length
                  ? `${summary.receivableOverdue.length} vencido${summary.receivableOverdue.length === 1 ? "" : "s"}`
                  : "Nada vencido"}
              </small>
            </button>
            <button
              className="finance-account"
              onClick={() => {
                setPayablesView("open");
                setTab("payables");
              }}
            >
              <span>A pagar</span>
              <b>{money(summary.payable)}</b>
              <small className={summary.payableOverdue.length ? "tone-overdue" : summary.payableWeek.length ? "tone-week" : ""}>
                {summary.payableOverdue.length
                  ? `${summary.payableOverdue.length} vencida${summary.payableOverdue.length === 1 ? "" : "s"}`
                  : summary.payableWeek.length
                    ? `${summary.payableWeek.length} vence${summary.payableWeek.length === 1 ? "" : "m"} esta semana`
                    : "Nada vencido"}
              </small>
            </button>
            <div className="finance-account">
              <span>Próximos 30 dias</span>
              <b className={summary.next30In - summary.next30Out < 0 ? "tone-overdue" : ""}>
                {signedMoney(cents(summary.next30In - summary.next30Out))}
              </b>
              <small>
                entra {money(summary.next30In)} · sai {money(summary.next30Out)}
              </small>
            </div>
          </div>
          <Section
            title={`Resultado de ${monthLabel(month)}`}
            description="Vendas concluídas no mês menos os custos delas e as despesas com vencimento no mês."
          >
            <div className="finance-table dre-table">
              <DataTable headers={["", monthLabel(month), monthLabel(previousMonthOf(month))]}>
                {dre.lines.map((line) => {
                  const before = previous.lines.find((x) => x.key === line.key)?.value ?? 0;
                  return (
                    <tr key={line.key} className={`dre-${line.kind}`}>
                      <td>
                        <b>{line.label}</b>
                        {line.detail && <small>{line.detail}</small>}
                      </td>
                      <td>{signedMoney(line.value)}</td>
                      <td>{signedMoney(before)}</td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
            <p className="finance-note">
              Compras de filamento e manutenção aparecem no extrato, mas não como despesa aqui: já estão no custo das peças
              vendidas. A categoria Impostos também fica fora, porque o imposto de cada venda já é descontado no pedido. Anúncios
              informados nos pedidos e despesas de Marketing se somam: lance cada gasto em um lugar só.
            </p>
            <div className="finance-actions">
              <Button variant="outline" onClick={exportDre}>
                <Download />
                Exportar resultado (CSV)
              </Button>
            </div>
          </Section>
        </>
      )}
      {tab === "payables" && (
        <Section
          title="Contas a pagar"
          description="Despesas, compras de filamento a prazo e parcelas. Contas recorrentes geram a do mês seguinte quando são pagas."
        >
          <div className="finance-filter">
            <button className={payablesView === "open" ? "active" : ""} onClick={() => setPayablesView("open")}>
              Em aberto ({openPayables.length})
            </button>
            <button className={payablesView === "month" ? "active" : ""} onClick={() => setPayablesView("month")}>
              {monthLabel(month)} ({monthPayables.length})
            </button>
          </div>
          {payables.length ? (
            <div className="finance-table">
              <DataTable headers={["Vencimento", "Descrição", "Valor", "Situação", ""]}>
                {payables.map((e) => {
                  const due = e.status === "pendente" ? dueState(e.dueDate, reference) : null;
                  return (
                    <tr key={e.id}>
                      <td>{dateLabel(e.dueDate)}</td>
                      <td data-label="Descrição">
                        <b>{e.description}</b>
                        <small>
                          {[
                            e.category,
                            e.recurring ? "Recorrente" : "",
                            e.source?.kind === "purchase" ? "Compra de filamento" : "",
                            e.source?.kind === "maintenance" ? "Manutenção" : "",
                            e.note,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </td>
                      <td data-label="Valor">{money(e.amount)}</td>
                      <td data-label="Situação">
                        {e.status === "pago" ? (
                          <span className="due-chip due-paid">Paga em {dateLabel(e.paidAt)}</span>
                        ) : e.status === "cancelado" ? (
                          <span className="due-chip due-cancelled">Cancelada</span>
                        ) : (
                          <span className={`due-chip due-${due!.tone}`}>{due!.label}</span>
                        )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {e.status === "pendente" && (
                            <Button size="sm" onClick={() => setPayId(e.id)}>
                              Pagar
                            </Button>
                          )}
                          {e.status !== "cancelado" && (
                            <Button
                              size="sm"
                              variant="outline"
                              aria-label={`Editar ${e.description}`}
                              onClick={() => setExpenseDialog({ id: e.id })}
                            >
                              <Pencil />
                            </Button>
                          )}
                          {e.status === "pendente" && (
                            <Button size="sm" variant="ghost" className="danger-action" onClick={() => setCancelId(e.id)}>
                              Cancelar
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          ) : (
            <Empty
              title={payablesView === "open" ? "Nenhuma conta em aberto" : "Nenhuma conta neste mês"}
              description="Use Nova conta a pagar para lançar aluguel, energia, assinaturas ou parcelas."
            />
          )}
        </Section>
      )}
      {tab === "receivables" && (
        <Section
          title="Contas a receber"
          description="Pedidos ainda não quitados. Marketplaces entram pelo valor do repasse, já sem as taxas."
        >
          {openReceivables.length ? (
            <div className="finance-table">
              <DataTable headers={["Previsão", "Pedido", "Esperado", "Recebido", "Saldo", "Situação", ""]}>
                {openReceivables.map((p) => {
                  const order = state.orders.find((o) => o.id === p.orderId),
                    due = dueState(p.dueDate, reference);
                  return (
                    <tr key={p.id}>
                      <td data-label="Previsão">{dateLabel(p.dueDate)}</td>
                      <td data-label="Pedido">
                        <b>{order?.number || "Pedido"}</b>
                        <small>
                          {[
                            order?.customerName,
                            order?.channel === "shopee"
                              ? "Shopee"
                              : order?.channel === "ml"
                                ? "Mercado Livre"
                                : order?.channel === "direct"
                                  ? "Venda direta"
                                  : "",
                            order ? statusLabel(order.status) : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </small>
                      </td>
                      <td data-label="Esperado">{money(p.expected)}</td>
                      <td data-label="Recebido">{money(p.received)}</td>
                      <td data-label="Saldo">
                        <b>{money(remainingOf(p))}</b>
                      </td>
                      <td data-label="Situação">
                        <span className={`due-chip due-${p.status === "parcial" && due.tone === "open" ? "partial" : due.tone}`}>
                          {p.status === "parcial" && due.tone === "open" ? "Parcial" : due.label}
                        </span>
                      </td>
                      <td>
                        <Button size="sm" onClick={() => setReceiveId(p.id)}>
                          Receber
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </div>
          ) : (
            <Empty title="Nada a receber" description="Todos os pedidos estão quitados." />
          )}
        </Section>
      )}
      {tab === "ledger" && (
        <Section
          title={`Extrato de ${monthLabel(month)}`}
          description="Tudo o que entrou e saiu do caixa, pela data do pagamento."
        >
          <div className="ledger-summary">
            <span>
              Saldo inicial <b>{signedMoney(opening)}</b>
            </span>
            <span className="tone-in">
              Entradas <b>{money(inflow)}</b>
            </span>
            <span className="tone-out">
              Saídas <b>{money(outflow)}</b>
            </span>
            <span>
              Saldo final <b>{signedMoney(closing)}</b>
            </span>
            <Button size="sm" variant="outline" onClick={exportLedger}>
              <Download />
              Exportar CSV
            </Button>
          </div>
          {ledgerRows.length ? (
            <div className="finance-table">
              <DataTable headers={["Data", "Descrição", "Entrada", "Saída", "Saldo"]}>
                {ledgerRows.map(({ entry, balance }) => (
                  <tr key={entry.id}>
                    <td data-label="Data">{dateLabel(entry.date)}</td>
                    <td data-label="Descrição">
                      <b>{entry.description}</b>
                      <small>{entry.category}</small>
                    </td>
                    <td data-label="Entrada" className="tone-in">
                      {entry.kind === "in" ? money(entry.amount) : ""}
                    </td>
                    <td data-label="Saída" className="tone-out">
                      {entry.kind === "out" ? money(entry.amount) : ""}
                    </td>
                    <td data-label="Saldo">{signedMoney(balance)}</td>
                  </tr>
                ))}
              </DataTable>
            </div>
          ) : (
            <Empty
              title="Sem movimento neste mês"
              description="Recebimentos e pagamentos aparecem aqui na data em que acontecem."
            />
          )}
        </Section>
      )}
      <ExpenseDialog target={expenseDialog} state={state} save={save} saving={saving} onClose={() => setExpenseDialog(null)} />
      <PayExpenseDialog
        expense={state.expenses.find((e) => e.id === payId)}
        state={state}
        save={save}
        saving={saving}
        onClose={() => setPayId(null)}
      />
      <ReceivePaymentDialog
        payment={state.payments.find((p) => p.id === receiveId)}
        state={state}
        save={save}
        saving={saving}
        onClose={() => setReceiveId(null)}
      />
      <AlertDialog
        open={Boolean(cancelTarget)}
        onOpenChange={(open) => {
          if (!open) setCancelId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta conta?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.description} · {money(cancelTarget?.amount || 0)}. Ela sai das contas a pagar e do resultado do mês.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Manter</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmCancel}>
              Cancelar conta
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ExpenseDialog({
  target,
  state,
  save,
  saving,
  onClose,
}: {
  target: { id?: string } | null;
  state: AppState;
  save: any;
  saving: boolean;
  onClose: () => void;
}) {
  const expense = target?.id ? state.expenses.find((e) => e.id === target.id) : undefined,
    creating = Boolean(target && !target.id),
    [paidNow, setPaidNow] = useState(false);
  useEffect(() => {
    setPaidNow(false);
  }, [target]);
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...state.expenses.map((e) => e.category)])]
    .filter((c) => c !== PURCHASE_CATEGORY && c !== MAINTENANCE_CATEGORY)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  async function submit(event: any) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    try {
      if (creating) {
        const installments = Math.max(1, Math.trunc(n(f, "installments") || 1)),
          next = createExpenses(state, {
            description: s(f, "description"),
            category: s(f, "category"),
            amount: n(f, "amount"),
            dueDate: s(f, "dueDate"),
            recurring: Boolean(f.get("recurring")),
            note: s(f, "note"),
            paidAt: paidNow ? s(f, "paidAt") || today() : undefined,
            installments,
          });
        if (await save(next, "expense-create")) {
          toast.success(
            installments > 1
              ? `${installments} parcelas lançadas em Contas a pagar`
              : paidNow
                ? "Despesa lançada como paga"
                : "Conta a pagar criada",
          );
          onClose();
        }
      } else if (expense) {
        const next = updateExpense(state, expense.id, {
          description: s(f, "description"),
          category: s(f, "category"),
          amount: n(f, "amount"),
          dueDate: s(f, "dueDate"),
          note: s(f, "note"),
          ...(expense.status === "pago" ? { paidAt: s(f, "paidAt") } : { recurring: Boolean(f.get("recurring")) }),
        });
        if (await save(next, "expense-update")) {
          toast.success("Conta atualizada");
          onClose();
        }
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }
  return (
    <Dialog
      open={Boolean(target)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="entity-dialog">
        <DialogHeader>
          <DialogTitle>{creating ? "Nova conta a pagar" : "Editar conta"}</DialogTitle>
          <DialogDescription>
            {creating
              ? "Aluguel, energia, assinaturas, ferramentas. Compras de filamento são lançadas em Insumos."
              : expense?.status === "pago"
                ? "Esta conta já foi paga; ajuste os dados se algo foi lançado errado."
                : "Os dados valem só para esta conta."}
          </DialogDescription>
        </DialogHeader>
        {target && (creating || expense) && (
          <form key={target.id || "novo"} className="form-grid cols-2" onSubmit={submit}>
            <Field label="Descrição" name="description" value={expense?.description} required className="span-2" />
            <label className="field">
              <span>Categoria</span>
              <Input
                name="category"
                list="expense-categories"
                defaultValue={expense?.category || ""}
                placeholder="Ex.: Aluguel"
                required
              />
              <datalist id="expense-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <Field
              label={creating ? "Valor total" : "Valor"}
              name="amount"
              type="number"
              step=".01"
              value={expense?.amount}
              required
            />
            <Field
              label={creating ? "Vencimento (1ª parcela)" : "Vencimento"}
              name="dueDate"
              type="date"
              value={expense?.dueDate || today()}
              required
            />
            {creating && <Field label="Parcelas" name="installments" type="number" value="1" />}
            {expense?.status === "pago" && (
              <Field label="Data do pagamento" name="paidAt" type="date" value={localDay(expense.paidAt)} required />
            )}
            <Field label="Observação" name="note" value={expense?.note} className="span-2" />
            {(creating || expense?.status === "pendente") && (
              <label className="check-field">
                <input type="checkbox" name="recurring" defaultChecked={expense?.recurring} />
                Repete todo mês
              </label>
            )}
            {creating && (
              <label className="check-field">
                <input type="checkbox" checked={paidNow} onChange={(e) => setPaidNow(e.target.checked)} />
                Já está paga
              </label>
            )}
            {creating && paidNow && <Field label="Data do pagamento" name="paidAt" type="date" value={today()} />}
            <DialogFooter className="span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>{creating ? "Lançar" : "Salvar"}</SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PayExpenseDialog({
  expense,
  state,
  save,
  saving,
  onClose,
}: {
  expense?: Expense;
  state: AppState;
  save: any;
  saving: boolean;
  onClose: () => void;
}) {
  async function submit(event: any) {
    event.preventDefault();
    if (!expense) return;
    const f = new FormData(event.currentTarget);
    try {
      const next = payExpense(state, expense.id, { date: s(f, "date"), amount: n(f, "amount") });
      if (await save(next, "expense-paid")) {
        toast.success(expense.recurring ? "Conta paga. A do próximo mês já está em Contas a pagar." : "Conta paga");
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }
  return (
    <Dialog
      open={Boolean(expense)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="entity-dialog">
        <DialogHeader>
          <DialogTitle>Pagar conta</DialogTitle>
          <DialogDescription>
            {expense?.description} · vence {dateLabel(expense?.dueDate)}
          </DialogDescription>
        </DialogHeader>
        {expense && (
          <form key={expense.id} className="form-grid cols-2" onSubmit={submit}>
            <Field label="Data do pagamento" name="date" type="date" value={today()} required />
            <Field label="Valor pago" name="amount" type="number" step=".01" value={expense.amount} required />
            {expense.recurring && (
              <p className="finance-note span-2">
                Conta recorrente: ao pagar, a de {dateLabel(addMonthsDay(expense.dueDate))} é criada em aberto.
              </p>
            )}
            <DialogFooter className="span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>Confirmar pagamento</SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ReceivePaymentDialog({
  payment,
  state,
  save,
  saving,
  onClose,
}: {
  payment?: Payment;
  state: AppState;
  save: any;
  saving: boolean;
  onClose: () => void;
}) {
  const order = payment && state.orders.find((o) => o.id === payment.orderId),
    remaining = payment ? remainingOf(payment) : 0;
  async function submit(event: any) {
    event.preventDefault();
    if (!payment) return;
    const f = new FormData(event.currentTarget);
    try {
      const next = receivePayment(state, payment.id, {
          amount: n(f, "amount"),
          date: s(f, "date"),
          method: s(f, "method"),
          note: s(f, "note"),
        }),
        after = next.payments.find((p) => p.id === payment.id)!;
      if (await save(next, "payment-received")) {
        toast.success(
          after.status === "pago" ? "Pedido quitado" : `Recebimento parcial registrado. Faltam ${money(remainingOf(after))}.`,
        );
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }
  return (
    <Dialog
      open={Boolean(payment)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="entity-dialog">
        <DialogHeader>
          <DialogTitle>Registrar recebimento</DialogTitle>
          <DialogDescription>
            {order?.number} · {order?.customerName} · saldo {money(remaining)}
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <form key={payment.id} className="form-grid cols-2" onSubmit={submit}>
            {receiptsOf(payment).length > 0 && (
              <div className="span-2 receipt-history">
                {receiptsOf(payment).map((r) => (
                  <div key={r.id}>
                    <span>
                      {dateLabel(r.date)} · {r.method || "—"}
                    </span>
                    <b>{money(r.amount)}</b>
                  </div>
                ))}
              </div>
            )}
            <Field label="Valor recebido" name="amount" type="number" step=".01" value={remaining} required />
            <Field label="Data" name="date" type="date" value={today()} required />
            <Field label="Forma" name="method" value={payment.method} />
            <Field label="Observação" name="note" />
            <p className="finance-note span-2">
              Para receber em partes (sinal e restante, por exemplo), informe só o valor que entrou agora.
            </p>
            <DialogFooter className="span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>Registrar</SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export const addMonthsDay = (day?: string) => (day ? addMonthsFinance(day, 1) : undefined);
