import { getDatabaseProvider } from "@/db/provider";
import { readImage } from "@/db/image-repository";
import { imageBytes, isImageId } from "@/lib/images";

export const dynamic = "force-dynamic";

/**
 * Entrega a foto de um produto. Não pede senha porque a foto também aparece no orçamento público;
 * o endereço tem 128 bits aleatórios, então só abre quem recebeu o link. Uma foto nunca muda depois
 * de guardada (trocar a foto gera outro endereço), por isso o navegador pode guardá-la por um ano.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDatabaseProvider();
  const image = db && isImageId(id) ? await readImage(db, id).catch(() => undefined) : undefined;
  if (!image) return new Response("Foto não encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(imageBytes(image) as BodyInit, {
    headers: {
      "Content-Type": image.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
