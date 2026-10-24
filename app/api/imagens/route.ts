import { getCurrentUser } from "@/app/auth";
import { getDatabaseProvider } from "@/db/provider";
import { storeImage } from "@/db/image-repository";
import { MAX_IMAGE_BYTES, imageFromBytes, imageUrl } from "@/lib/images";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

/** Recebe uma foto já reduzida pelo navegador e devolve o endereço para guardar no produto. */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("Sessão expirada. Entre de novo.", 401);
  const db = getDatabaseProvider();
  // Sem banco, o navegador mantém a foto embutida no próprio dado.
  if (!db) return Response.json({ error: "Sem banco configurado.", local: true }, { status: 501, headers: NO_STORE });
  if (Number(request.headers.get("content-length") || 0) > MAX_IMAGE_BYTES)
    return fail("A foto passa de 2 MB. Escolha outra.", 413);
  try {
    const image = imageFromBytes(new Uint8Array(await request.arrayBuffer()));
    const id = await storeImage(db, user.userId, image);
    return Response.json({ url: imageUrl(id) }, { headers: NO_STORE });
  } catch (error) {
    return fail(error instanceof Error ? error.message : "Não foi possível guardar a foto.", 400);
  }
}
