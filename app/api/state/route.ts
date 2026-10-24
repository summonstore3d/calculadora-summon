import { getCurrentUser } from "@/app/auth";
import { emptyState, hydrateState, type AppState } from "@/lib/summon";
import { newIntegrityIssues } from "@/lib/integrity";
import { loadOperationalState, saveOperationalState } from "@/db/state-repository";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const MAX_BODY_BYTES = 8_000_000;
const CONFLICT_MESSAGE = "Os dados foram atualizados em outra sessão. A versão mais recente foi carregada.";

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function requireApiUser() {
  const user = await getCurrentUser();
  if (!user) throw new HttpError("Sessão expirada. Entre de novo.", 401);
  return user;
}

/** Regras que valem para qualquer gravação: estrutura, valores e o que já foi concluído não muda. */
function assertState(value: any, previous: AppState | undefined, action?: string) {
  if (!value || typeof value !== "object") throw new Error("Estado inválido");
  for (const key of ["materials", "products", "orders", "productionOrders", "lots", "movements", "payments", "expenses"]) {
    if (!Array.isArray(value[key])) throw new Error(`Coleção inválida: ${key}`);
    const ids = new Set<string>();
    for (const row of value[key]) {
      if (!row?.id || ids.has(row.id)) throw new Error(`ID inválido ou duplicado em ${key}`);
      ids.add(row.id);
    }
  }
  if (value.materials.some((x: any) => Number(x.stockGrams) < 0) || value.products.some((x: any) => Number(x.readyStock) < 0) || value.lots.some((x: any) => Number(x.balance) < 0 || Number(x.balance) > Number(x.initialQuantity))) throw new Error("A operação resultaria em estoque inválido");
  if (value.expenses.some((x: any) => Number(x.amount) < 0) || value.payments.some((x: any) => Number(x.expected) < 0 || Number(x.received) < 0)) throw new Error("Valor financeiro inválido");
  if (!previous || action === "backup-import") return;
  for (const old of previous.orders || []) {
    if (!["concluido", "devolvido"].includes(old.status)) continue;
    const next = value.orders.find((x: any) => x.id === old.id);
    if (!next) throw new Error("Vendas históricas não podem ser excluídas");
    if (JSON.stringify(old.items) !== JSON.stringify(next.items) || old.gross !== next.gross || old.netRevenue !== next.netRevenue || old.cost !== next.cost || old.profit !== next.profit) throw new Error("Vendas concluídas são imutáveis");
    if (old.status === "devolvido" && next.status !== "devolvido") throw new Error("Devoluções não podem ser reabertas");
  }
  for (const old of previous.productionOrders || []) {
    if (old.status !== "concluida") continue;
    const next = value.productionOrders.find((x: any) => x.id === old.id);
    if (!next || JSON.stringify(old) !== JSON.stringify(next)) throw new Error("Produções concluídas são imutáveis");
  }
  // Coerência entre estoque, lotes, recebimentos e numeração: a gravação não pode criar problema novo.
  const issues = newIntegrityIssues(previous, value);
  if (issues.length) throw new Error(`Gravação recusada: ${issues[0].message}`);
}

function errorResponse(error: unknown) {
  const status = error instanceof HttpError ? error.status : 400;
  return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status, headers: NO_STORE });
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const result = await loadOperationalState(user.userId);
    if (!result) return Response.json({ state: emptyState, version: 0, local: true, storage: "browser" }, { headers: NO_STORE });
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    return error instanceof HttpError ? errorResponse(error) : Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 503, headers: NO_STORE });
  }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser();
    if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) throw new HttpError("Os dados passam do limite de 8 MB por gravação. Remova fotos muito grandes dos produtos.", 413);
    const body = (await request.json()) as { state: unknown; version: number; action?: string; confirmImport?: boolean; entityType?: string; entityId?: string };
    if (body.action === "backup-import" && body.confirmImport !== true) throw new Error("Importação de backup não confirmada.");
    const existing = await loadOperationalState(user.userId);
    if (!existing) throw new HttpError("Banco indisponível. Configure TURSO_DATABASE_URL e TURSO_AUTH_TOKEN na Vercel.", 503);
    const expected = Number(body.version) || 0;
    if (existing.version !== expected) return Response.json({ error: CONFLICT_MESSAGE, conflict: true, state: existing.state, version: existing.version }, { status: 409, headers: NO_STORE });
    const nextState = hydrateState(body.state);
    assertState(nextState, existing.state, body.action);
    const result = await saveOperationalState(user.userId, nextState, expected, body.action || "save", body.entityType, body.entityId);
    if (result.conflict && "state" in result) return Response.json({ error: CONFLICT_MESSAGE, conflict: true, state: result.state, version: result.version }, { status: 409, headers: NO_STORE });
    return Response.json({ version: result.version, updatedAt: result.updatedAt }, { headers: NO_STORE });
  } catch (error) {
    return errorResponse(error);
  }
}
