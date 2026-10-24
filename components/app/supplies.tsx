"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Pencil, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { AppState, cents, money, normalize, reversePurchase, today, uid, updatePurchase, type Supply } from "@/lib/summon";
import { adjustSupplyStock, createSupply, registerPurchase, registerSupplyPurchase, updateSupply } from "@/lib/operations";
import { restockMessage, restockPlan, type RestockItem } from "@/lib/restock";
import { type PurchasePaymentPlan, addDays } from "@/lib/finance";
import { DataTable, Empty, Field, PageHead, SaveButton, SelectField, Stat, dateLabel, n, s } from "@/components/app/shared";

export function MaterialsPage({
  state,
  save,
  saving,
  initialMaterialRef,
}: {
  state: AppState;
  save: any;
  saving: boolean;
  initialMaterialRef?: string;
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("all"),
    [createOpen, setCreateOpen] = useState(false),
    [action, setAction] = useState<{ materialId: string; mode: "purchase" | "adjust" | "edit" } | null>(null),
    [removeId, setRemoveId] = useState<string | null>(null),
    items = state.materials.filter(
      (m) =>
        normalize(m.brand + " " + m.type + " " + m.color).includes(normalize(q)) &&
        (status === "all" || (status === "low" ? m.stockGrams <= m.minimumGrams : m.status === status)),
    ),
    removeMaterial = state.materials.find((m) => m.id === removeId),
    hasLinks =
      removeMaterial &&
      Boolean(
        state.purchases.some((x) => x.materialId === removeMaterial.id) ||
        state.movements.some((x) => x.entity === "material" && x.entityId === removeMaterial.id) ||
        state.recipes.some((r) => r.parts.some((p) => p.materialId === removeMaterial.id)) ||
        state.productionOrders.some((o) =>
          [...o.plannedConsumption, ...o.actualConsumption].some((p) => p.materialId === removeMaterial.id),
        ),
      ),
    mustArchive = Boolean(removeMaterial && (hasLinks || removeMaterial.stockGrams > 0));
  useEffect(() => {
    if (!initialMaterialRef) return;
    const purchase = initialMaterialRef.startsWith("entrada:"),
      reference = purchase ? initialMaterialRef.slice(8) : initialMaterialRef,
      material = state.materials.find((item) => item.id === reference);
    if (!material) return;
    setStatus("all");
    setQ("");
    if (purchase) setAction({ materialId: material.id, mode: "purchase" });
    window.setTimeout(
      () => document.getElementById(`material-${material.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }),
      80,
    );
  }, [initialMaterialRef]);
  async function confirmRemoval() {
    if (!removeMaterial) return;
    const next = mustArchive
      ? {
          ...state,
          materials: state.materials.map((m) => (m.id === removeMaterial.id ? { ...m, status: "archived" as const } : m)),
        }
      : { ...state, materials: state.materials.filter((m) => m.id !== removeMaterial.id) };
    if (await save(next, mustArchive ? "material-archive" : "material-delete")) {
      toast.success(mustArchive ? "Material arquivado" : "Material excluído");
      setRemoveId(null);
    }
  }
  return (
    <>
      <PageHead
        title="Materiais"
        description="Insumos, custo médio, localização e nível de estoque."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Novo material
          </Button>
        }
      />
      <div className="toolbar">
        <div className="search">
          <Search />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar marca, tipo ou cor" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">Todos</option>
          <option value="low">Estoque baixo</option>
          <option value="active">Ativos</option>
          <option value="archived">Arquivados</option>
        </select>
        <Badge variant="outline">{items.length} materiais</Badge>
      </div>
      {items.length ? (
        <DataTable headers={["Material", "Marca", "Estoque", "Custo médio", "Local", "Situação", "Ações"]}>
          {items.map((m) => {
            const low = m.stockGrams <= m.minimumGrams,
              focused = initialMaterialRef?.replace("entrada:", "") === m.id;
            return (
              <tr key={m.id} id={`material-${m.id}`} className={focused ? "context-focus" : ""}>
                <td data-label="Material">
                  <b>{m.type}</b>
                  <small>{m.color}</small>
                </td>
                <td data-label="Marca">{m.brand}</td>
                <td data-label="Estoque">
                  <b>{(m.stockGrams / 1000).toFixed(3)} kg</b>
                  <small>Mín. {(m.minimumGrams / 1000).toFixed(3)} kg</small>
                </td>
                <td data-label="Custo médio">{money(m.averageCost)}/kg</td>
                <td data-label="Local">{m.location || "—"}</td>
                <td data-label="Situação">
                  <Badge variant={m.status === "archived" ? "outline" : low ? "destructive" : "secondary"}>
                    {m.status === "archived" ? "Arquivado" : low ? "Baixo" : "Normal"}
                  </Badge>
                </td>
                <td data-label="Ações">
                  <div className="material-actions">
                    {m.status === "active" && (
                      <Button size="sm" onClick={() => setAction({ materialId: m.id, mode: "purchase" })}>
                        Entrada
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setAction({ materialId: m.id, mode: "adjust" })}>
                      Ajustar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setAction({ materialId: m.id, mode: "edit" })}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="danger-action" onClick={() => setRemoveId(m.id)}>
                      {m.status === "archived" ? "Excluir" : "Excluir"}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <Empty title="Nenhum material encontrado" description="Ajuste os filtros ou cadastre um novo insumo." />
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="entity-dialog">
          <DialogHeader>
            <DialogTitle>Novo material</DialogTitle>
            <DialogDescription>
              Cadastre a identidade do insumo. O estoque será alimentado depois pela ação Registrar compra.
            </DialogDescription>
          </DialogHeader>
          <form
            className="dialog-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                duplicate = state.materials.find(
                  (m) =>
                    normalize(m.brand) === normalize(s(f, "brand")) &&
                    normalize(m.type) === normalize(s(f, "type")) &&
                    normalize(m.color) === normalize(s(f, "color")),
                );
              if (duplicate) return toast.error("Este material já existe. Registre uma compra nele.");
              const material = {
                id: uid(),
                brand: s(f, "brand"),
                type: s(f, "type"),
                color: s(f, "color"),
                unit: "kg" as const,
                supplierId: s(f, "supplierId") || undefined,
                location: s(f, "location"),
                stockGrams: 0,
                averageCost: 0,
                minimumGrams: n(f, "minimum") * 1000,
                status: "active" as const,
                createdAt: new Date().toISOString(),
              };
              if (await save({ ...state, materials: [...state.materials, material] }, "material-create")) {
                toast.success("Material cadastrado");
                setCreateOpen(false);
              }
            }}
          >
            <div className="form-grid cols-2">
              <Field label="Marca" name="brand" required />
              <Field label="Tipo" name="type" required />
              <Field label="Cor" name="color" required />
              <Field label="Localização" name="location" />
              <Field label="Estoque mínimo (kg)" name="minimum" type="number" step=".001" value=".25" />
              <SelectField label="Fornecedor" name="supplierId">
                <option value="">Não definido</option>
                {state.suppliers
                  .filter((x) => x.status === "active")
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </SelectField>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>Cadastrar material</SaveButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <MaterialActionDialog action={action} state={state} save={save} saving={saving} onClose={() => setAction(null)} />
      <AlertDialog open={Boolean(removeMaterial)} onOpenChange={(open) => !open && setRemoveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{mustArchive ? "Arquivar material?" : "Excluir material?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {mustArchive
                ? "Este material possui estoque ou histórico vinculado. Para preservar compras, produções e fichas técnicas, ele será arquivado e deixará de aparecer em novas operações."
                : "Este material ainda não possui estoque nem histórico. A exclusão será permanente."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRemoval} disabled={saving}>
              {mustArchive ? "Arquivar material" : "Excluir material"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PurchasePaymentFields() {
  const [mode, setMode] = useState("paid");
  return (
    <>
      <label className="field">
        <span>Pagamento</span>
        <select name="payMode" value={mode} onChange={(event) => setMode(event.target.value)}>
          <option value="paid">À vista · pago na data da compra</option>
          <option value="due">A prazo · uma parcela</option>
          <option value="installments">Parcelado</option>
        </select>
        <small>{mode === "paid" ? "Sai do caixa na data da compra." : "Vai para Contas a pagar no Financeiro."}</small>
      </label>
      {mode !== "paid" && <Field label="1º vencimento" name="payDue" type="date" value={addDays(today(), 30)} required />}
      {mode === "installments" && <Field label="Parcelas" name="payInstallments" type="number" value="2" />}
    </>
  );
}

export function MaterialActionDialog({
  action,
  state,
  save,
  saving,
  onClose,
}: {
  action: { materialId: string; mode: "purchase" | "adjust" | "edit"; suggestedKg?: number; suggestedPrice?: number } | null;
  state: AppState;
  save: any;
  saving: boolean;
  onClose: () => void;
}) {
  const material = action && state.materials.find((m) => m.id === action.materialId),
    mode = action?.mode;
  const titles = { purchase: "Registrar entrada de estoque", adjust: "Ajustar saldo do estoque", edit: "Editar material" };
  async function submit(e: any) {
    e.preventDefault();
    if (!material || !mode) return;
    const f = new FormData(e.currentTarget);
    if (mode === "purchase") {
      try {
        const result = registerPurchase(state, material.id, {
            kg: n(f, "kg"),
            subtotal: n(f, "subtotal"),
            freight: n(f, "freight"),
            date: s(f, "date"),
            supplierId: s(f, "supplierId") || undefined,
            note: s(f, "note"),
            payment: {
              mode: (s(f, "payMode") || "paid") as PurchasePaymentPlan["mode"],
              dueDate: s(f, "payDue"),
              installments: n(f, "payInstallments"),
            },
          }),
          payables = result.payables;
        if (await save(result.state, "purchase-create")) {
          toast.success(
            payables[0]?.status === "pago"
              ? "Entrada registrada e saída lançada no caixa"
              : payables.length
                ? `Entrada registrada e ${payables.length === 1 ? "conta a pagar criada" : `${payables.length} parcelas criadas em Contas a pagar`}`
                : "Entrada registrada e estoque atualizado",
          );
          onClose();
        }
      } catch (error: any) {
        toast.error(error.message);
      }
      return;
    }
    if (mode === "adjust") {
      const operation = s(f, "operation"),
        kg = n(f, "kg"),
        reason = s(f, "reason");
      if (kg < 0 || !reason) return toast.error("Informe a quantidade e o motivo do ajuste");
      const grams = kg * 1000,
        next = operation === "set" ? grams : operation === "add" ? material.stockGrams + grams : material.stockGrams - grams;
      if (next < 0) return toast.error("O ajuste deixaria o estoque negativo");
      const movement = {
        id: uid(),
        entity: "material" as const,
        entityId: material.id,
        kind: "inventory-adjustment",
        quantity: next - material.stockGrams,
        balanceAfter: next,
        unitCost: material.averageCost,
        note: reason,
        createdAt: new Date().toISOString(),
      };
      if (
        await save(
          {
            ...state,
            materials: state.materials.map((x) => (x.id === material.id ? { ...x, stockGrams: next } : x)),
            movements: [...state.movements, movement],
          },
          "material-adjust",
        )
      ) {
        toast.success("Saldo ajustado");
        onClose();
      }
      return;
    }
    const brand = s(f, "brand"),
      type = s(f, "type"),
      color = s(f, "color"),
      duplicate = state.materials.find(
        (m) =>
          m.id !== material.id &&
          normalize(m.brand) === normalize(brand) &&
          normalize(m.type) === normalize(type) &&
          normalize(m.color) === normalize(color),
      );
    if (!brand || !type || !color) return toast.error("Preencha marca, tipo e cor");
    if (duplicate) return toast.error("Já existe um material com esta marca, tipo e cor");
    const updated = {
      ...material,
      brand,
      type,
      color,
      location: s(f, "location"),
      minimumGrams: n(f, "minimum") * 1000,
      supplierId: s(f, "supplierId") || undefined,
      status: s(f, "status") as "active" | "archived",
    };
    if (await save({ ...state, materials: state.materials.map((m) => (m.id === material.id ? updated : m)) }, "material-edit")) {
      toast.success("Material atualizado");
      onClose();
    }
  }
  return (
    <Dialog open={Boolean(material)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="material-dialog">
        <DialogHeader>
          <DialogTitle>{mode ? titles[mode] : "Material"}</DialogTitle>
          <DialogDescription>
            {material ? `${material.type} ${material.color} · ${material.brand}` : "Gerencie o material selecionado."}
          </DialogDescription>
        </DialogHeader>
        {material && (
          <form className="material-dialog-form" onSubmit={submit}>
            {mode === "purchase" && (
              <>
                <div className="stock-callout">
                  <span>Saldo atual</span>
                  <b>{(material.stockGrams / 1000).toFixed(3)} kg</b>
                  <small>{money(material.averageCost)}/kg de custo médio</small>
                </div>
                <div className="form-grid cols-2">
                  <Field label="Peso comprado (kg)" name="kg" type="number" step=".001" value={action?.suggestedKg} required />
                  <Field
                    label="Valor dos materiais"
                    name="subtotal"
                    type="number"
                    step=".01"
                    value={
                      action?.suggestedKg && action.suggestedPrice
                        ? Math.round(action.suggestedKg * action.suggestedPrice * 100) / 100
                        : undefined
                    }
                    required
                  />
                  <Field label="Frete" name="freight" type="number" step=".01" value="0" />
                  <Field label="Data da compra" name="date" type="date" value={today()} />
                  <SelectField label="Fornecedor" name="supplierId" value={material.supplierId || ""}>
                    <option value="">Não definido</option>
                    {state.suppliers
                      .filter((x) => x.status === "active")
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                  </SelectField>
                  <Field label="Observação" name="note" />
                  <PurchasePaymentFields />
                </div>
              </>
            )}
            {mode === "adjust" && (
              <>
                <div className="stock-callout">
                  <span>Saldo atual</span>
                  <b>{(material.stockGrams / 1000).toFixed(3)} kg</b>
                  <small>O custo médio não será alterado.</small>
                </div>
                <div className="form-grid cols-2">
                  <SelectField label="Tipo de ajuste" name="operation" value="set">
                    <option value="set">Definir saldo total</option>
                    <option value="add">Adicionar ao saldo</option>
                    <option value="remove">Retirar do saldo</option>
                  </SelectField>
                  <Field label="Quantidade (kg)" name="kg" type="number" step=".001" required />
                  <Field
                    label="Motivo do ajuste"
                    name="reason"
                    className="span-2"
                    required
                    placeholder="Ex.: contagem de inventário"
                  />
                </div>
              </>
            )}
            {mode === "edit" && (
              <div className="form-grid cols-2">
                <Field label="Marca" name="brand" value={material.brand} required />
                <Field label="Tipo" name="type" value={material.type} required />
                <Field label="Cor" name="color" value={material.color} required />
                <Field label="Localização" name="location" value={material.location} />
                <Field
                  label="Estoque mínimo (kg)"
                  name="minimum"
                  type="number"
                  step=".001"
                  value={material.minimumGrams / 1000}
                />
                <SelectField label="Fornecedor" name="supplierId" value={material.supplierId || ""}>
                  <option value="">Não definido</option>
                  {state.suppliers
                    .filter((x) => x.status === "active")
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </SelectField>
                <SelectField label="Situação" name="status" value={material.status}>
                  <option value="active">Ativo</option>
                  <option value="archived">Arquivado</option>
                </SelectField>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>
                {mode === "purchase" ? "Registrar entrada" : mode === "adjust" ? "Salvar ajuste" : "Salvar alterações"}
              </SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PurchasesPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("active"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [action, setAction] = useState<{ id: string; mode: "edit" | "reverse" } | null>(null),
    rows = state.purchases.filter((p) => {
      const m = state.materials.find((x) => x.id === p.materialId),
        matchesStatus = status === "all" || (status === "reversed" ? Boolean(p.reversedAt) : !p.reversedAt);
      return (
        normalize((m?.type || "") + " " + (m?.color || "") + " " + (m?.brand || "") + " " + p.note).includes(normalize(q)) &&
        matchesStatus &&
        (!from || p.date >= from) &&
        (!to || p.date <= to)
      );
    }),
    activeRows = rows.filter((x) => !x.reversedAt),
    total = activeRows.reduce((a, p) => a + p.total, 0),
    weight = activeRows.reduce((a, p) => a + p.kg, 0),
    purchase = action && state.purchases.find((p) => p.id === action.id);
  async function submit(e: any) {
    e.preventDefault();
    if (!purchase || !action) return;
    const f = new FormData(e.currentTarget);
    try {
      const next =
        action.mode === "edit"
          ? updatePurchase(state, purchase.id, { date: s(f, "date"), note: s(f, "note") })
          : reversePurchase(state, purchase.id, s(f, "reason"));
      if (await save(next, action.mode === "edit" ? "purchase-edit" : "purchase-reverse")) {
        toast.success(action.mode === "edit" ? "Compra atualizada" : "Compra estornada e estoque corrigido");
        setAction(null);
      }
    } catch (err: any) {
      toast.error(err.message);
    }
  }
  return (
    <>
      <PageHead title="Compras" description="Histórico financeiro e auditoria das entradas de materiais." />
      <div className="stats-grid compact">
        <Stat label="Investimento filtrado" value={money(total)} />
        <Stat label="Peso comprado" value={weight.toFixed(3) + " kg"} />
        <Stat label="Entradas ativas" value={String(activeRows.length)} />
      </div>
      <div className="entity-filters">
        <div className="search">
          <Search />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar material ou observação" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação da compra">
          <option value="active">Ativas</option>
          <option value="reversed">Estornadas</option>
          <option value="all">Todas</option>
        </select>
        <label>
          <span>De</span>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label>
          <span>Até</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      {rows.length ? (
        <DataTable headers={["Data", "Material", "Peso", "Valor", "R$/kg", "Observação", "Situação", "Ações"]}>
          {rows.map((p) => {
            const m = state.materials.find((x) => x.id === p.materialId);
            return (
              <tr key={p.id}>
                <td data-label="Data">{dateLabel(p.date)}</td>
                <td data-label="Material">
                  <b>
                    {m?.type} {m?.color}
                  </b>
                  <small>{m?.brand}</small>
                </td>
                <td data-label="Peso">{p.kg.toFixed(3)} kg</td>
                <td data-label="Valor">{money(p.total)}</td>
                <td data-label="R$/kg">{money(p.kg ? p.total / p.kg : 0)}</td>
                <td data-label="Observação">{p.note || "—"}</td>
                <td data-label="Situação">
                  <Badge variant={p.reversedAt ? "destructive" : "secondary"}>{p.reversedAt ? "Estornada" : "Ativa"}</Badge>
                </td>
                <td data-label="Ações">
                  <div className="row-actions">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(p.reversedAt)}
                      onClick={() => setAction({ id: p.id, mode: "edit" })}
                    >
                      <Pencil />
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="danger-action"
                      disabled={Boolean(p.reversedAt)}
                      onClick={() => setAction({ id: p.id, mode: "reverse" })}
                    >
                      Estornar
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <Empty title="Nenhuma compra encontrada" description="Ajuste os filtros ou registre uma entrada em Materiais." />
      )}
      <Dialog open={Boolean(purchase)} onOpenChange={(open) => !open && setAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{action?.mode === "edit" ? "Editar dados da compra" : "Estornar compra"}</DialogTitle>
            <DialogDescription>
              {purchase &&
                `${purchase.kg.toFixed(3)} kg · ${money(purchase.total)}. O estorno preserva a auditoria e retira o peso do estoque.`}
            </DialogDescription>
          </DialogHeader>
          {purchase && (
            <form className="dialog-form" onSubmit={submit}>
              {action?.mode === "edit" ? (
                <div className="form-grid cols-2">
                  <Field label="Data" name="date" type="date" value={purchase.date} />
                  <Field label="Observação" name="note" value={purchase.note} />
                </div>
              ) : (
                <Field label="Motivo do estorno" name="reason" required placeholder="Ex.: lançamento duplicado" />
              )}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setAction(null)}>
                  Cancelar
                </Button>
                <SaveButton saving={saving}>{action?.mode === "edit" ? "Salvar alterações" : "Confirmar estorno"}</SaveButton>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- outros insumos

const SUPPLY_UNITS = ["un", "g", "ml", "m", "par", "pacote"];
const qty = (value: number, unit: string) => `${String(Math.round(value * 100) / 100).replace(".", ",")} ${unit}`;

export function SuppliesPage({
  state,
  save,
  saving,
  initialSupplyRef,
}: {
  state: AppState;
  save: any;
  saving: boolean;
  initialSupplyRef?: string;
}) {
  const [q, setQ] = useState(""),
    [status, setStatus] = useState("active"),
    [editing, setEditing] = useState<{ id?: string } | null>(null),
    [action, setAction] = useState<{ supplyId: string; mode: "purchase" | "adjust"; suggested?: number; price?: number } | null>(
      null,
    ),
    supplies = state.supplies || [],
    rows = supplies.filter(
      (x) =>
        normalize(x.name).includes(normalize(q)) &&
        (status === "all" || (status === "low" ? x.status === "active" && x.stock <= x.minimum : x.status === status)),
    ),
    stockValue = cents(supplies.filter((x) => x.status === "active").reduce((sum, x) => sum + x.stock * x.averageCost, 0)),
    low = supplies.filter((x) => x.status === "active" && x.stock <= x.minimum).length,
    usedIn = (id: string) =>
      state.products.filter((p) =>
        state.recipes.find((r) => r.id === p.activeRecipeId)?.components?.some((c) => c.supplyId === id),
      );
  useEffect(() => {
    if (!initialSupplyRef?.startsWith("entrada:")) return;
    const supply = supplies.find((x) => x.id === initialSupplyRef.slice(8));
    if (supply) setAction({ supplyId: supply.id, mode: "purchase" });
  }, [initialSupplyRef]);
  return (
    <>
      <PageHead
        title="Outros insumos"
        description="Ímãs, parafusos, caixas, etiquetas e tudo o que entra na peça além do filamento."
        action={
          <Button onClick={() => setEditing({})}>
            <Plus />
            Novo insumo
          </Button>
        }
      />
      <div className="stats-grid">
        <Stat label="Insumos ativos" value={String(supplies.filter((x) => x.status === "active").length)} />
        <Stat label="Abaixo do mínimo" value={String(low)} tone={low ? "red" : "green"} />
        <Stat label="Valor em estoque" value={money(stockValue)} detail="Pelo custo médio" />
      </div>
      <div className="toolbar">
        <div className="search">
          <Search />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar insumo" />
        </div>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="active">Ativos</option>
          <option value="low">Abaixo do mínimo</option>
          <option value="archived">Arquivados</option>
          <option value="all">Todos</option>
        </select>
      </div>
      {rows.length ? (
        <DataTable headers={["Insumo", "Estoque", "Mínimo", "Custo médio", "Usado em", "Ações"]}>
          {rows.map((x) => {
            const products = usedIn(x.id),
              isLow = x.status === "active" && x.stock <= x.minimum;
            return (
              <tr key={x.id} id={`supply-${x.id}`}>
                <td data-label="Insumo">
                  <b>{x.name}</b>
                  <small>
                    {[state.suppliers.find((f) => f.id === x.supplierId)?.name, x.location].filter(Boolean).join(" · ") ||
                      "Sem fornecedor"}
                  </small>
                </td>
                <td data-label="Estoque">
                  <b className={isLow ? "tone-overdue" : ""}>{qty(x.stock, x.unit)}</b>
                  {isLow && <small className="tone-overdue">Abaixo do mínimo</small>}
                </td>
                <td data-label="Mínimo">{qty(x.minimum, x.unit)}</td>
                <td data-label="Custo médio">
                  {money(x.averageCost)}/{x.unit}
                </td>
                <td data-label="Usado em">
                  {products.length ? products.map((p) => p.name).join(", ") : <span className="muted">Nenhuma ficha</span>}
                </td>
                <td data-label="Ações">
                  <div className="row-actions">
                    {x.status === "active" && (
                      <Button size="sm" onClick={() => setAction({ supplyId: x.id, mode: "purchase" })}>
                        Entrada
                      </Button>
                    )}
                    {x.status === "active" && (
                      <Button size="sm" variant="outline" onClick={() => setAction({ supplyId: x.id, mode: "adjust" })}>
                        Ajustar
                      </Button>
                    )}
                    <Button size="sm" variant="outline" aria-label={`Editar ${x.name}`} onClick={() => setEditing({ id: x.id })}>
                      <Pencil />
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </DataTable>
      ) : (
        <Empty
          title={supplies.length ? "Nenhum insumo neste filtro" : "Nenhum insumo cadastrado"}
          description="Cadastre ímãs, parafusos, caixas ou etiquetas para incluí-los na ficha técnica e baixar o estoque na produção."
        />
      )}
      <SupplyDialog target={editing} state={state} save={save} saving={saving} onClose={() => setEditing(null)} />
      <SupplyActionDialog action={action} state={state} save={save} saving={saving} onClose={() => setAction(null)} />
    </>
  );
}

function SupplyDialog({
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
  const supply = target?.id ? state.supplies.find((x) => x.id === target.id) : undefined,
    creating = Boolean(target && !target.id);
  async function submit(event: any) {
    event.preventDefault();
    const f = new FormData(event.currentTarget),
      input = {
        name: s(f, "name"),
        unit: s(f, "unit"),
        minimum: n(f, "minimum"),
        supplierId: s(f, "supplierId"),
        location: s(f, "location"),
      };
    try {
      if (creating) {
        if (
          await save(
            createSupply(state, { ...input, stock: n(f, "stock"), averageCost: n(f, "averageCost") }).state,
            "supply-create",
          )
        ) {
          toast.success("Insumo cadastrado");
          onClose();
        }
      } else if (supply) {
        if (
          await save(
            updateSupply(state, supply.id, { ...input, status: (s(f, "status") as Supply["status"]) || supply.status }),
            "supply-update",
          )
        ) {
          toast.success("Insumo atualizado");
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
          <DialogTitle>{creating ? "Novo insumo" : `Editar ${supply?.name || "insumo"}`}</DialogTitle>
          <DialogDescription>
            {creating
              ? "O saldo inicial e o custo entram uma vez; depois, use Entrada para compras."
              : "Para mudar o saldo, use Ajustar ou Entrada."}
          </DialogDescription>
        </DialogHeader>
        {target && (creating || supply) && (
          <form key={target.id || "novo"} className="form-grid cols-2" onSubmit={submit}>
            <Field
              label="Nome"
              name="name"
              value={supply?.name}
              placeholder="Ex.: Ímã de neodímio 10x3 mm"
              required
              className="span-2"
            />
            <SelectField label="Unidade" name="unit" value={supply?.unit || "un"}>
              {SUPPLY_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </SelectField>
            <Field label="Estoque mínimo" name="minimum" type="number" step=".01" value={supply?.minimum ?? 0} />
            {creating && <Field label="Saldo atual" name="stock" type="number" step=".01" value={0} />}
            {creating && <Field label="Custo por unidade (R$)" name="averageCost" type="number" step=".0001" value={0} />}
            <SelectField label="Fornecedor" name="supplierId" value={supply?.supplierId || ""}>
              <option value="">Não definido</option>
              {state.suppliers
                .filter((x) => x.status === "active")
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
            </SelectField>
            <Field label="Local" name="location" value={supply?.location} placeholder="Ex.: Gaveta 2" />
            {supply && (
              <SelectField label="Situação" name="status" value={supply.status}>
                <option value="active">Ativo</option>
                <option value="archived">Arquivado</option>
              </SelectField>
            )}
            <DialogFooter className="span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>{creating ? "Cadastrar" : "Salvar"}</SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplyActionDialog({
  action,
  state,
  save,
  saving,
  onClose,
}: {
  action: { supplyId: string; mode: "purchase" | "adjust"; suggested?: number; price?: number } | null;
  state: AppState;
  save: any;
  saving: boolean;
  onClose: () => void;
}) {
  const supply = action && state.supplies.find((x) => x.id === action.supplyId);
  async function submit(event: any) {
    event.preventDefault();
    if (!supply || !action) return;
    const f = new FormData(event.currentTarget);
    try {
      if (action.mode === "purchase") {
        const result = registerSupplyPurchase(state, supply.id, {
          quantity: n(f, "quantity"),
          subtotal: n(f, "subtotal"),
          freight: n(f, "freight"),
          date: s(f, "date"),
          supplierId: s(f, "supplierId") || undefined,
          note: s(f, "note"),
          payment: {
            mode: (s(f, "payMode") || "paid") as PurchasePaymentPlan["mode"],
            dueDate: s(f, "payDue"),
            installments: n(f, "payInstallments"),
          },
        });
        if (await save(result.state, "supply-purchase")) {
          toast.success(
            result.payables[0]?.status === "pago"
              ? "Entrada registrada e saída lançada no caixa"
              : result.payables.length
                ? `Entrada registrada e ${result.payables.length === 1 ? "conta a pagar criada" : `${result.payables.length} parcelas criadas`}`
                : "Entrada registrada",
          );
          onClose();
        }
      } else if (
        await save(
          adjustSupplyStock(state, supply.id, {
            operation: s(f, "operation") as "set" | "add" | "remove",
            quantity: n(f, "quantity"),
            reason: s(f, "reason"),
          }),
          "supply-adjust",
        )
      ) {
        toast.success("Estoque ajustado");
        onClose();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }
  return (
    <Dialog
      open={Boolean(supply)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="entity-dialog">
        <DialogHeader>
          <DialogTitle>
            {action?.mode === "purchase" ? "Registrar entrada" : "Ajustar estoque"} · {supply?.name}
          </DialogTitle>
          <DialogDescription>
            Saldo atual: {supply ? qty(supply.stock, supply.unit) : ""} · custo médio {money(supply?.averageCost || 0)}/
            {supply?.unit}
          </DialogDescription>
        </DialogHeader>
        {supply && action && (
          <form key={`${supply.id}-${action.mode}`} className="form-grid cols-2" onSubmit={submit}>
            {action.mode === "purchase" ? (
              <>
                <Field
                  label={`Quantidade (${supply.unit})`}
                  name="quantity"
                  type="number"
                  step=".01"
                  value={action.suggested}
                  required
                />
                <Field
                  label="Valor dos itens"
                  name="subtotal"
                  type="number"
                  step=".01"
                  value={action.suggested && action.price ? cents(action.suggested * action.price) : undefined}
                  required
                />
                <Field label="Frete" name="freight" type="number" step=".01" value="0" />
                <Field label="Data da compra" name="date" type="date" value={today()} />
                <SelectField label="Fornecedor" name="supplierId" value={supply.supplierId || ""}>
                  <option value="">Não definido</option>
                  {state.suppliers
                    .filter((x) => x.status === "active")
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                </SelectField>
                <Field label="Observação" name="note" />
                <PurchasePaymentFields />
              </>
            ) : (
              <>
                <SelectField label="Operação" name="operation" value="set">
                  <option value="set">Definir saldo (contagem)</option>
                  <option value="add">Somar</option>
                  <option value="remove">Retirar (perda, uso fora da produção)</option>
                </SelectField>
                <Field
                  label={`Quantidade (${supply.unit})`}
                  name="quantity"
                  type="number"
                  step=".01"
                  value={supply.stock}
                  required
                />
                <Field label="Motivo" name="reason" required className="span-2" placeholder="Ex.: contagem do mês" />
              </>
            )}
            <DialogFooter className="span-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <SaveButton saving={saving}>{action.mode === "purchase" ? "Registrar entrada" : "Salvar ajuste"}</SaveButton>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- reabastecimento

export function RestockPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const [coverDays, setCoverDays] = useState(state.settings.restockCoverDays ?? 15),
    [quantities, setQuantities] = useState<Record<string, number>>({}),
    [materialAction, setMaterialAction] = useState<{
      materialId: string;
      mode: "purchase";
      suggestedKg?: number;
      suggestedPrice?: number;
    } | null>(null),
    [supplyAction, setSupplyAction] = useState<{ supplyId: string; mode: "purchase"; suggested?: number; price?: number } | null>(
      null,
    ),
    plan = useMemo(() => restockPlan(state, new Date(), coverDays), [state, coverDays]),
    amount = (item: RestockItem) => quantities[item.id] ?? item.suggested,
    total = cents(plan.items.reduce((sum, item) => sum + amount(item) * item.unitPrice, 0));
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lista copiada. Cole no WhatsApp ou no e-mail do fornecedor.");
    } catch {
      toast.error("Não foi possível copiar. Selecione o texto da lista e copie manualmente.");
    }
  }
  function buy(item: RestockItem) {
    if (item.kind === "material")
      setMaterialAction({ materialId: item.id, mode: "purchase", suggestedKg: amount(item), suggestedPrice: item.unitPrice });
    else setSupplyAction({ supplyId: item.id, mode: "purchase", suggested: amount(item), price: item.unitPrice });
  }
  return (
    <>
      <PageHead
        title="Reabastecimento"
        description="O que comprar para cobrir o estoque mínimo, a produção em aberto e o consumo dos próximos dias."
        action={
          <label className="finance-month">
            <span>Cobrir os próximos</span>
            <select value={coverDays} onChange={(e) => setCoverDays(Number(e.target.value))}>
              {[7, 15, 30, 45, 60].map((d) => (
                <option key={d} value={d}>
                  {d} dias
                </option>
              ))}
            </select>
          </label>
        }
      />
      <div className="stats-grid">
        <Stat
          label="Itens para comprar"
          value={String(plan.items.length)}
          detail={`${plan.items.filter((i) => i.urgency === "critical").length} urgentes`}
          tone={plan.items.some((i) => i.urgency === "critical") ? "red" : "green"}
        />
        <Stat label="Custo estimado" value={money(total)} detail="Pelo preço da última compra" />
        <Stat label="Fornecedores" value={String(plan.groups.length)} />
      </div>
      {plan.groups.length ? (
        plan.groups.map((group) => (
          <section key={group.supplierId || "sem"} className="restock-group">
            <div className="restock-group-head">
              <span>
                <b>{group.supplierName}</b>
                <small>
                  {group.contact ||
                    (group.supplierId ? "Sem contato cadastrado" : "Defina o fornecedor no cadastro do material ou insumo")}
                </small>
              </span>
              <span className="restock-group-total">
                {money(cents(group.items.reduce((sum, i) => sum + amount(i) * i.unitPrice, 0)))}
              </span>
              <Button size="sm" variant="outline" onClick={() => copy(restockMessage(group, quantities))}>
                <ClipboardList />
                Copiar lista
              </Button>
            </div>
            <div className="finance-table">
              <DataTable headers={["Item", "Estoque", "Produção aberta", "Comprar", "Estimado", ""]}>
                {group.items.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Item">
                      <b>{item.name}</b>
                      <small className={item.urgency === "critical" ? "tone-overdue" : "tone-week"}>
                        {item.reason}
                        {item.detail ? ` · ${item.detail}` : ""}
                      </small>
                    </td>
                    <td data-label="Estoque">
                      {qty(item.stock, item.unit)}
                      <small>mínimo {qty(item.minimum, item.unit)}</small>
                    </td>
                    <td data-label="Produção aberta">{item.planned ? qty(item.planned, item.unit) : "—"}</td>
                    <td data-label="Comprar">
                      <label className="restock-qty">
                        <Input
                          type="number"
                          min="0"
                          step={item.kind === "material" ? "1" : "1"}
                          value={amount(item)}
                          aria-label={`Quantidade de ${item.name}`}
                          onChange={(e) =>
                            setQuantities((current) => ({ ...current, [item.id]: Math.max(0, Number(e.target.value) || 0) }))
                          }
                        />
                        <span>{item.unit}</span>
                      </label>
                    </td>
                    <td data-label="Estimado">
                      {money(cents(amount(item) * item.unitPrice))}
                      <small>
                        {money(item.unitPrice)}/{item.unit}
                      </small>
                    </td>
                    <td>
                      <Button size="sm" disabled={!amount(item)} onClick={() => buy(item)}>
                        Registrar compra
                      </Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
          </section>
        ))
      ) : (
        <Empty
          title="Nada para comprar agora"
          description={`Filamento e insumos cobrem o mínimo, a produção aberta e o consumo dos próximos ${coverDays} dias.`}
        />
      )}
      <p className="finance-note">
        Sugestão = estoque mínimo + o que as ordens de produção abertas vão usar + o consumo médio dos últimos 30 dias ×{" "}
        {coverDays} dias − o estoque atual. Filamento é arredondado para kg inteiros.
      </p>
      <MaterialActionDialog
        action={materialAction}
        state={state}
        save={save}
        saving={saving}
        onClose={() => setMaterialAction(null)}
      />
      <SupplyActionDialog action={supplyAction} state={state} save={save} saving={saving} onClose={() => setSupplyAction(null)} />
    </>
  );
}
