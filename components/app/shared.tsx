"use client";

import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AppState, Product } from "@/lib/summon";
import { toCsv, type Cell } from "@/lib/export";

export const n = (f: FormData, k: string) => Number(f.get(k)) || 0;

export const s = (f: FormData, k: string) => String(f.get(k) || "").trim();

export const dateLabel = (v?: string) =>
  v ? new Intl.DateTimeFormat("pt-BR").format(new Date(v.length === 10 ? v + "T12:00:00" : v)) : "—";

export const channelLabel = { direct: "Venda direta", shopee: "Shopee", ml: "Mercado Livre", other: "Outro" };

const statusLabels: Record<string, string> = {
  orcamento: "Orçamento",
  aprovado: "Aprovado",
  producao: "Em produção",
  pronto: "Pronto",
  enviado: "Enviado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  devolvido: "Devolvido",
  planejada: "Planejada",
  aguardando_material: "Aguardando material",
  fila: "Na fila",
  imprimindo: "Imprimindo",
  acabamento: "Acabamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  pendente: "Pendente",
  parcial: "Parcial",
  pago: "Pago",
  estornado: "Estornado",
  active: "Ativo",
  paused: "Pausado",
  archived: "Arquivado",
  maintenance: "Em manutenção",
  finished: "Encerrada",
  preventiva: "Preventiva",
  corretiva: "Corretiva",
  baixa: "Baixa",
  normal: "Normal",
  alta: "Alta",
  hybrid: "Pronta entrega e encomenda",
  ready: "Pronta entrega",
  "made-to-order": "Sob encomenda",
};
/** Nome em português de uma situação gravada (orcamento → Orçamento, active → Ativo). */
export const statusLabel = (v: string) => statusLabels[v] || v.replaceAll("_", " ").replace(/\b\w/g, (x) => x.toUpperCase());

export function Field({
  label,
  name,
  type = "text",
  value,
  step,
  required = false,
  placeholder,
  className = "",
}: {
  label: string;
  name: string;
  type?: string;
  value?: number | string;
  step?: string;
  required?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <label className={"field " + className}>
      <span>{label}</span>
      <Input name={name} type={type} defaultValue={value} step={step} required={required} placeholder={placeholder} />
    </label>
  );
}

export function SelectField({
  label,
  name,
  value,
  children,
  className = "",
}: {
  label: string;
  name: string;
  value?: string;
  children: any;
  className?: string;
}) {
  return (
    <label className={"field " + className}>
      <span>{label}</span>
      <select name={name} defaultValue={value}>
        {children}
      </select>
    </label>
  );
}

/** Reduz a foto (lado maior 900 px, WebP) e devolve como texto, gravado junto com o produto. Uma foto de celular de 3 MB vira cerca de 60 KB. */
export async function compressImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Envie uma foto JPG, PNG ou WebP");
  if (file.size > 15_000_000) throw new Error("A foto passa de 15 MB. Escolha uma menor.");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 900 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.82);
}

/**
 * Guarda a foto no servidor e devolve o endereço curto para o produto.
 * Sem banco (modo "só neste navegador") ou sem conexão com o servidor de fotos, a foto continua embutida.
 */
export async function uploadImage(dataUrl: string): Promise<string> {
  if (!dataUrl.startsWith("data:image/")) return dataUrl;
  const blob = await (await fetch(dataUrl)).blob();
  let response: Response;
  try {
    response = await fetch("/api/imagens", { method: "POST", headers: { "content-type": blob.type }, body: blob });
  } catch {
    throw new Error("Sem conexão para enviar a foto. Tente de novo.");
  }
  if (response.status === 501 || response.status === 404) return dataUrl;
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.url) throw new Error(result.error || "Não foi possível enviar a foto.");
  return String(result.url);
}

/** Reduz a foto escolhida e envia ao servidor. */
export async function productImage(file: File) {
  return uploadImage(await compressImage(file));
}

/** Antes de importar um backup: envia as fotos uma a uma, para a gravação dos dados não passar do limite. */
export async function uploadInlineImages(state: AppState, onProgress?: (done: number, total: number) => void) {
  const pending = state.products.filter((p) => p.imageUrl?.startsWith("data:image/"));
  if (!pending.length) return state;
  const urls = new Map<string, string>();
  let done = 0;
  for (const product of pending) {
    const source = product.imageUrl!;
    if (!urls.has(source)) urls.set(source, await uploadImage(source));
    onProgress?.(++done, pending.length);
  }
  return {
    ...state,
    products: state.products.map((p) => (p.imageUrl && urls.has(p.imageUrl) ? { ...p, imageUrl: urls.get(p.imageUrl) } : p)),
  };
}

export function PageHead({ title, description, action }: { title: string; description: string; action?: any }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Empty({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty">
      <PackageSearch />
      <strong>{title}</strong>
      <p>{description}</p>
    </div>
  );
}

export function Stat({
  label,
  value,
  detail,
  tone = "blue",
  onClick,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: string;
  onClick?: () => void;
}) {
  return (
    <Card
      className={`stat stat-${tone} ${onClick ? "stat-action" : ""}`}
      onClick={onClick}
      onKeyDown={(e) => onClick && ["Enter", " "].includes(e.key) && onClick()}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <CardContent>
        <span>{label}</span>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </CardContent>
    </Card>
  );
}

export function SaveButton({ saving, children }: { saving: boolean; children: any }) {
  return (
    <Button disabled={saving} type="submit">
      {saving ? "Salvando…" : children}
    </Button>
  );
}

export function DataTable({ headers, children }: { headers: string[]; children: any }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: string; children: any }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <p className="muted">{description}</p>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** CSV que o Excel em português abre certo: marca UTF-8, ponto e vírgula e vírgula decimal. */
export function downloadCsv(filename: string, rows: Cell[][]) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Miniatura do produto: a foto, ou as iniciais num fundo de cor fixa por produto. */
const THUMB_COLORS = ["#dbeafe", "#dcfce7", "#fef3c7", "#fce7f3", "#ede9fe", "#ccfbf1", "#ffedd5"];

/** Miniatura do produto para reconhecer na lista. Sem foto, mostra as iniciais sobre uma cor fixa por produto. */
export function ProductThumb({ product, size = 56 }: { product: Pick<Product, "name" | "imageUrl" | "id">; size?: number }) {
  const initials =
    product.name
      .split(/\s+/)
      .filter((word) => word.length > 2 || /^[A-Z0-9]/.test(word))
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || product.name.slice(0, 1).toUpperCase();
  const color = THUMB_COLORS[[...product.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % THUMB_COLORS.length];
  return (
    <span
      className="product-thumb"
      style={{ width: size, height: size, background: product.imageUrl ? undefined : color }}
      aria-hidden="true"
    >
      {product.imageUrl ? <img src={product.imageUrl} alt="" loading="lazy" /> : initials}
    </span>
  );
}
