"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Download, Search } from "lucide-react";
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
import { AppState, money, normalize, today } from "@/lib/summon";
import { applyInventory, inventoryDiff, inventoryLines, type InventoryCounts, type InventoryKind } from "@/lib/inventory";
import { Empty, PageHead, downloadCsv } from "@/components/app/shared";

const DRAFT_KEY = "inventario-rascunho";
const KIND_LABEL: Record<InventoryKind, string> = { material: "Filamento", supply: "Outros insumos", product: "Peças prontas" };
const qty = (value: number, unit: string) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: unit === "g" ? 0 : 2 })} ${unit}`;
const signed = (value: number, unit: string) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${qty(Math.abs(value), unit)}`;
const signedMoney = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`;

function readDraft(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFT_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** Contagem física de filamento, insumos e peças prontas, aplicada de uma vez. O rascunho fica neste navegador. */
export function InventoryPage({ state, save, saving }: { state: AppState; save: any; saving: boolean }) {
  const [counts, setCounts] = useState<Record<string, string>>(readDraft),
    [kind, setKind] = useState<"all" | InventoryKind>("all"),
    [query, setQuery] = useState(""),
    [onlyChanged, setOnlyChanged] = useState(false),
    [confirming, setConfirming] = useState(false),
    [reason, setReason] = useState("Contagem de rotina");
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(counts));
    } catch {}
  }, [counts]);

  const lines = useMemo(() => inventoryLines(state), [state]);
  const parsed: InventoryCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(counts)
          .filter(([, value]) => value.trim() !== "" && Number.isFinite(Number(value.replace(",", "."))))
          .map(([key, value]) => [key, Number(value.replace(",", "."))]),
      ),
    [counts],
  );
  const diff = useMemo(() => inventoryDiff(state, parsed), [state, parsed]);
  const byKey = new Map(diff.lines.map((line) => [line.key, line]));
  const q = normalize(query);
  const visible = lines.filter(
    (line) =>
      (kind === "all" || line.kind === kind) &&
      (!q || normalize(`${line.name} ${line.detail}`).includes(q)) &&
      (!onlyChanged || (byKey.get(line.key)?.diff ?? 0) !== 0),
  );
  const set = (key: string, value: string) => setCounts((current) => ({ ...current, [key]: value }));

  function exportSheet() {
    downloadCsv(`inventario-${today()}.csv`, [
      ["Tipo", "Item", "Detalhe", "Unidade", "Sistema", "Contado", "Diferença", "Valor da diferença"],
      ...visible.map((line) => {
        const counted = byKey.get(line.key);
        return [
          KIND_LABEL[line.kind],
          line.name,
          line.detail,
          line.unit,
          line.system,
          counted?.counted ?? null,
          counted?.diff ?? null,
          counted?.valueDiff ?? null,
        ];
      }),
    ]);
  }

  async function apply() {
    try {
      const result = applyInventory(state, parsed, reason);
      if (!result.changed.length) {
        toast.success("Inventário conferido, sem diferenças");
        setCounts({});
        setConfirming(false);
        return;
      }
      if (await save(result.state, "inventory")) {
        toast.success(
          result.changed.length
            ? `Inventário aplicado: ${result.changed.length} ${result.changed.length === 1 ? "item corrigido" : "itens corrigidos"}`
            : "Inventário conferido, sem diferenças",
        );
        setCounts({});
        setConfirming(false);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  }

  const groups = (["material", "supply", "product"] as InventoryKind[])
    .map((k) => [k, visible.filter((line) => line.kind === k)] as const)
    .filter(([, rows]) => rows.length);

  return (
    <>
      <PageHead
        title="Inventário"
        description="Conte o estoque físico e corrija todas as diferenças de uma vez. A contagem fica salva neste navegador até você aplicar."
        action={
          <Button variant="outline" onClick={exportSheet}>
            <Download />
            {diff.counted ? "Baixar contagem" : "Baixar folha de contagem"}
          </Button>
        }
      />
      <div className="inventory-filters">
        <div className="inventory-tabs" role="tablist">
          {(["all", "material", "supply", "product"] as const).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              className={kind === k ? "active" : ""}
              onClick={() => setKind(k)}
            >
              {k === "all" ? "Tudo" : KIND_LABEL[k]}
            </button>
          ))}
        </div>
        <label className="search">
          <Search />
          <Input placeholder="Buscar item" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <label className="inventory-only-changed">
          <input type="checkbox" checked={onlyChanged} onChange={(e) => setOnlyChanged(e.target.checked)} /> Só com diferença
        </label>
      </div>

      {groups.length ? (
        groups.map(([k, rows]) => (
          <section className="inventory-group" key={k}>
            <h2>
              {KIND_LABEL[k]}
              {k === "material" && <small>Some os rolos lacrados com o peso do rolo aberto, sem o carretel vazio.</small>}
            </h2>
            <div className="inventory-list">
              {rows.map((line) => {
                const counted = byKey.get(line.key),
                  tone = !counted ? "" : counted.diff === 0 ? "ok" : counted.diff < 0 ? "loss" : "gain";
                return (
                  <div key={line.key} className={`inventory-row ${tone}`}>
                    <span className="inventory-name">
                      <b>{line.name}</b>
                      <small>
                        {line.detail ? `${line.detail} · ` : ""}sistema: {qty(line.system, line.unit)}
                      </small>
                    </span>
                    <span className="inventory-input">
                      <Input
                        inputMode="decimal"
                        aria-label={`Contagem de ${line.name}`}
                        placeholder="Contado"
                        value={counts[line.key] ?? ""}
                        onChange={(e) => set(line.key, e.target.value)}
                      />
                      <em>{line.unit}</em>
                      <button
                        type="button"
                        title="Confere com o sistema"
                        aria-label={`${line.name} confere com o sistema`}
                        onClick={() => set(line.key, String(line.system))}
                      >
                        <Check />
                      </button>
                    </span>
                    <span className="inventory-diff">
                      {counted ? (
                        counted.diff === 0 ? (
                          <b>Confere</b>
                        ) : (
                          <>
                            <b>{signed(counted.diff, line.unit)}</b>
                            <small>{signedMoney(counted.valueDiff)}</small>
                          </>
                        )
                      ) : (
                        <small>Não contado</small>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <Empty title="Nada para mostrar" description="Ajuste a busca ou os filtros." />
      )}

      <div className="inventory-footer">
        <span>
          <b>
            {diff.counted} de {lines.length} contados · {diff.changed.length} com diferença
          </b>
          <small>
            Faltas {money(diff.loss)} · Sobras {money(diff.gain)} · Saldo {signedMoney(diff.net)}
          </small>
        </span>
        <div className="actions">
          <Button variant="outline" disabled={!diff.counted} onClick={() => setCounts({})}>
            Limpar
          </Button>
          <Button disabled={!diff.counted || saving} onClick={() => setConfirming(true)}>
            Aplicar inventário
          </Button>
        </div>
      </div>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aplicar inventário</AlertDialogTitle>
            <AlertDialogDescription>
              {diff.changed.length
                ? `${diff.changed.length} ${diff.changed.length === 1 ? "item terá" : "itens terão"} o estoque trocado pelo contado. Cada correção fica registrada nas movimentações com o motivo abaixo.`
                : "Tudo o que foi contado confere com o sistema. Nada será alterado."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {diff.changed.length > 0 && (
            <>
              <ul className="inventory-confirm">
                {diff.changed.slice(0, 8).map((line) => (
                  <li key={line.key}>
                    <span>{line.name}</span>
                    <b className={line.diff < 0 ? "negative" : "positive"}>{signed(line.diff, line.unit)}</b>
                  </li>
                ))}
                {diff.changed.length > 8 && <li className="muted">e mais {diff.changed.length - 8}</li>}
              </ul>
              <label className="field">
                <span>Motivo</span>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                apply();
              }}
            >
              {diff.changed.length ? "Corrigir estoque" : "Concluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
