import { getCurrentUser } from "@/app/auth";
import { PASSWORD_OWNER_ID } from "@/app/password-auth";
import { getDatabaseProvider } from "@/db/provider";
import { loadNormalizedState } from "@/db/state-repository";
import { deleteOrphanImages, readImage } from "@/db/image-repository";
import { inlineStoredImages, referencedImageIds } from "@/lib/images";
import { localDay } from "@/lib/summon";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

/** Comparação em tempo constante, para a chave não vazar pelo tempo de resposta. */
function sameSecret(a: string, b: string) {
  const x = new TextEncoder().encode(a),
    y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** Quem pode baixar: o dono logado, ou a cópia automática com BACKUP_SECRET (mínimo de 24 caracteres). */
async function authorized(request: Request) {
  if (await getCurrentUser()) return { automatic: false };
  const secret = process.env.BACKUP_SECRET || "",
    header = request.headers.get("authorization") || "";
  if (secret.length >= 24 && header.startsWith("Bearer ") && sameSecret(header.slice(7), secret)) return { automatic: true };
  return undefined;
}

/**
 * Backup completo: todos os dados e as fotos dentro do arquivo, no mesmo formato de "Exportar backup",
 * então pode ser importado em Configurações. A cópia automática também apaga fotos que nenhum produto
 * usa há mais de 30 dias.
 */
export async function GET(request: Request) {
  const access = await authorized(request);
  if (!access) return Response.json({ error: "Sem permissão." }, { status: 401, headers: NO_STORE });
  const db = getDatabaseProvider();
  if (!db) return Response.json({ error: "Sem banco configurado.", local: true }, { status: 501, headers: NO_STORE });
  try {
    const data = await loadNormalizedState(db, PASSWORD_OWNER_ID);
    if (!data) return Response.json({ error: "Ainda não há dados para copiar." }, { status: 404, headers: NO_STORE });
    const { state, missing } = await inlineStoredImages(data.state, (id) => readImage(db, id, PASSWORD_OWNER_ID));
    const removed = access.automatic
      ? await deleteOrphanImages(db, PASSWORD_OWNER_ID, referencedImageIds(data.state)).catch(() => 0)
      : 0;
    return new Response(JSON.stringify(state), {
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="backup-gestao-3d-${localDay(new Date().toISOString())}.json"`,
        "X-Backup-Version": String(data.version),
        "X-Backup-Missing-Images": String(missing),
        "X-Backup-Removed-Images": String(removed),
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Não foi possível gerar o backup." },
      { status: 503, headers: NO_STORE },
    );
  }
}
