"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { AppState, defaults, hydrateState, migrateLegacy, today, uid, type Settings } from "@/lib/summon";
import { DataTable, Field, PageHead, SaveButton, Section, n, s } from "@/components/app/shared";

export function SettingsPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const [pendingImport, setPendingImport] = useState<{ fileName: string; next: AppState } | null>(null);
  const backupCounts = (value: AppState) =>
    [
      ["Materiais", value.materials.length],
      ["Compras", value.purchases.length],
      ["Produtos", value.products.length],
      ["Pedidos", value.orders.length],
      ["Clientes", value.customers.length],
      ["Lotes", value.lots.length],
      ["Ordens de produção", value.productionOrders.length],
      ["Despesas", value.expenses.length],
      ["Pagamentos", value.payments.length],
    ] as const;
  const exportBackup = () => {
    const a = document.createElement("a"),
      u = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }));
    a.href = u;
    a.download = `backup-gestao-3d-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  };
  const labels: Record<keyof Settings, string> = {
    energyRate: "Tarifa de energia (R$/kWh)",
    power: "Potência padrão (kW)",
    manualHourRate: "Valor da hora manual",
    machineValue: "Valor padrão da máquina",
    machineLife: "Vida útil padrão (h)",
    markup: "Markup (%)",
    taxRate: "Impostos (%)",
    packagingCost: "Embalagem por unidade",
    maintenancePercent: "Reserva de manutenção (%)",
    minPrice: "Preço mínimo",
    rounding: "Arredondamento",
    shopeeFee: "Taxa Shopee (%)",
    shopeeFixed: "Taxa fixa Shopee",
    mlFee: "Taxa Mercado Livre (%)",
    mlFixed: "Taxa fixa Mercado Livre",
    shopeeReleaseDays: "Repasse Shopee (dias após a venda)",
    mlReleaseDays: "Repasse Mercado Livre (dias após a venda)",
    openingCash: "Saldo inicial do caixa (R$)",
  };
  return (
    <>
      <PageHead title="Parâmetros" description="Valores usados apenas em novos cálculos e fichas técnicas." />
      <Section title="Custos e canais">
        <form
          className="form-grid cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              settings = Object.fromEntries(Object.keys(defaults).map((k) => [k, n(f, k)])) as any;
            if (await save({ ...state, settings }, "settings-update")) toast.success("Parâmetros atualizados");
          }}
        >
          {(Object.keys(defaults) as (keyof Settings)[]).map((k) => (
            <Field key={k} label={labels[k]} name={k} type="number" step=".01" value={state.settings[k]} />
          ))}
          <SaveButton saving={saving}>Salvar parâmetros</SaveButton>
        </form>
      </Section>
      <Section title="Fornecedores">
        <form
          className="form-grid cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              supplier = {
                id: uid(),
                name: s(f, "name"),
                contact: s(f, "contact"),
                email: s(f, "email"),
                note: s(f, "note"),
                status: "active" as const,
              };
            if (await save({ ...state, suppliers: [...state.suppliers, supplier] }, "supplier-create")) {
              toast.success("Fornecedor cadastrado");
              e.currentTarget.reset();
            }
          }}
        >
          <Field label="Nome" name="name" required />
          <Field label="Contato" name="contact" />
          <Field label="E-mail" name="email" />
          <Field label="Observação" name="note" />
          <SaveButton saving={saving}>Cadastrar fornecedor</SaveButton>
        </form>
        <div className="simple-list">
          {state.suppliers.map((x) => (
            <div key={x.id}>
              <b>{x.name}</b>
              <span>{x.contact || x.email || "Sem contato"}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Metas mensais">
        <form
          className="form-grid cols-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget),
              goal = {
                id: uid(),
                month: s(f, "month"),
                revenue: n(f, "revenue"),
                profit: n(f, "profit"),
                margin: n(f, "margin"),
                production: n(f, "production"),
                sales: n(f, "sales"),
                cac: n(f, "cac"),
                roas: n(f, "roas"),
              };
            if (await save({ ...state, goals: [...state.goals.filter((g) => g.month !== goal.month), goal] }, "goal-save"))
              toast.success("Meta salva");
          }}
        >
          <Field label="Mês" name="month" type="month" required />
          <Field label="Faturamento" name="revenue" type="number" step=".01" />
          <Field label="Lucro" name="profit" type="number" step=".01" />
          <Field label="Margem (%)" name="margin" type="number" step=".1" />
          <Field label="Produção" name="production" type="number" />
          <Field label="Vendas" name="sales" type="number" />
          <Field label="CAC" name="cac" type="number" step=".01" />
          <Field label="ROAS" name="roas" type="number" step=".01" />
          <SaveButton saving={saving}>Salvar meta</SaveButton>
        </form>
      </Section>
      <div className="backup-actions">
        <Button variant="outline" onClick={exportBackup}>
          <Download />
          Exportar backup
        </Button>
        <label className="upload-button">
          <Upload />
          Importar backup
          <Input
            type="file"
            accept=".json,application/json"
            onChange={async (e) => {
              const input = e.currentTarget,
                file = input.files?.[0];
              input.value = "";
              if (!file) return;
              try {
                const raw = JSON.parse(await file.text());
                if (!raw || typeof raw !== "object" || (!Array.isArray(raw.materials) && !Array.isArray(raw.filaments)))
                  throw new Error("formato");
                setPendingImport({
                  fileName: file.name,
                  next: Array.isArray(raw.materials) ? hydrateState(raw) : migrateLegacy(raw),
                });
              } catch {
                toast.error("Este arquivo não é um backup deste sistema. Escolha o .json gerado em Exportar backup.");
              }
            }}
          />
        </label>
      </div>
      <AlertDialog
        open={Boolean(pendingImport)}
        onOpenChange={(open) => {
          if (!open) setPendingImport(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir todos os dados?</AlertDialogTitle>
            <AlertDialogDescription>
              Importar {pendingImport?.fileName} apaga os dados atuais e coloca os do arquivo no lugar. Exporte um backup antes,
              se ainda não exportou.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingImport && (
            <div className="backup-compare">
              <DataTable headers={["Registro", "Atual", "No arquivo"]}>
                {backupCounts(state).map(([label, current], index) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td>{current}</td>
                    <td>
                      <b>{backupCounts(pendingImport.next)[index][1]}</b>
                    </td>
                  </tr>
                ))}
              </DataTable>
              {backupCounts(pendingImport.next).every(([, count]) => count === 0) && (
                <p className="backup-empty-warning">O arquivo não tem nenhum registro. Importar deixa o sistema vazio.</p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <Button variant="outline" onClick={exportBackup}>
              <Download />
              Exportar backup atual
            </Button>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const next = pendingImport?.next;
                setPendingImport(null);
                if (next && (await save(next, "backup-import"))) toast.success("Backup importado");
              }}
            >
              Substituir dados
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
