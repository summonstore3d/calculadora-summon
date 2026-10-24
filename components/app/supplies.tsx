"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Search } from "lucide-react";
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
import { AppState, money, normalize, reversePurchase, today, uid, updatePurchase } from "@/lib/summon";
import { registerPurchase } from "@/lib/operations";
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
  action: { materialId: string; mode: "purchase" | "adjust" | "edit" } | null;
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
                  <Field label="Peso comprado (kg)" name="kg" type="number" step=".001" required />
                  <Field label="Valor dos materiais" name="subtotal" type="number" step=".01" required />
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
