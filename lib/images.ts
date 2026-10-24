// Fotos de produto fora dos dados principais.
//
// No banco, cada foto fica na tabela `images` e o produto guarda só o endereço curto (/api/imagens/<id>).
// Assim a gravação dos dados continua leve: a Vercel recusa envios acima de 4,5 MB, e uma foto embutida
// ocupa de 50 a 150 KB. Sem banco (modo "só neste navegador"), a foto continua embutida no próprio dado.
import type { AppState } from "./summon.ts";

export const IMAGE_ROUTE = "/api/imagens/";
export const MAX_IMAGE_BYTES = 2_000_000;
export const IMAGE_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
export type StoredImage = { contentType: ImageType; data: string; bytes: number };

const DATA_URL = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/;
const ID = /^[0-9a-f]{32}$/;

export const isInlineImage = (url?: string): url is string => !!url && url.startsWith("data:image/");
export const imageUrl = (id: string) => `${IMAGE_ROUTE}${id}`;
export const isImageId = (id: string) => ID.test(id);

/** Id de uma foto guardada no banco, a partir do endereço salvo no produto. */
export function imageIdFromUrl(url?: string) {
  if (!url?.startsWith(IMAGE_ROUTE)) return undefined;
  const id = url.slice(IMAGE_ROUTE.length);
  return isImageId(id) ? id : undefined;
}

/** Confere pelos primeiros bytes que o conteúdo é mesmo a imagem que diz ser. */
export function sniffImageType(bytes: Uint8Array): ImageType | undefined {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return undefined;
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
const fromBase64 = (data: string) => Uint8Array.from(atob(data.replace(/\s/g, "")), (c) => c.charCodeAt(0));

/** Valida bytes recebidos e devolve a foto pronta para guardar. */
export function imageFromBytes(bytes: Uint8Array): StoredImage {
  if (!bytes.length) throw new Error("A foto está vazia.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new Error("A foto passa de 2 MB depois de reduzida. Escolha outra.");
  const contentType = sniffImageType(bytes);
  if (!contentType) throw new Error("Envie uma foto JPG, PNG ou WebP.");
  return { contentType, data: toBase64(bytes), bytes: bytes.length };
}

/** Foto embutida (data:image/...;base64,...) → foto pronta para guardar. */
export function imageFromDataUrl(url: string): StoredImage {
  const match = url.match(DATA_URL);
  if (!match) throw new Error("Foto embutida em formato desconhecido.");
  return imageFromBytes(fromBase64(match[2]));
}

export const imageBytes = (image: Pick<StoredImage, "data">) => fromBase64(image.data);
export const dataUrlOf = (image: Pick<StoredImage, "contentType" | "data">) => `data:${image.contentType};base64,${image.data}`;

/** Ids das fotos que algum produto usa. */
export function referencedImageIds(state: Pick<AppState, "products">) {
  return new Set(state.products.map((p) => imageIdFromUrl(p.imageUrl)).filter((id): id is string => !!id));
}

/**
 * Tira as fotos embutidas dos produtos: cada uma é guardada por `store`, e o produto passa a apontar para ela.
 * Uma foto ilegível é descartada (o produto fica sem foto) em vez de impedir a gravação.
 */
export async function extractInlineImages<T extends Pick<AppState, "products">>(
  state: T,
  store: (image: StoredImage) => Promise<string>,
): Promise<{ state: T; moved: number; dropped: number }> {
  let moved = 0,
    dropped = 0;
  const cache = new Map<string, string | undefined>();
  const products = [];
  for (const product of state.products) {
    if (!isInlineImage(product.imageUrl)) {
      products.push(product);
      continue;
    }
    if (!cache.has(product.imageUrl)) {
      let image: StoredImage | undefined;
      try {
        image = imageFromDataUrl(product.imageUrl);
      } catch {
        image = undefined;
      }
      cache.set(product.imageUrl, image ? imageUrl(await store(image)) : undefined);
    }
    const url = cache.get(product.imageUrl);
    if (url) moved++;
    else dropped++;
    products.push({ ...product, imageUrl: url });
  }
  return moved || dropped ? { state: { ...state, products }, moved, dropped } : { state, moved, dropped };
}

/** O contrário, para o backup: cada produto leva a própria foto dentro do arquivo. */
export async function inlineStoredImages<T extends Pick<AppState, "products">>(
  state: T,
  load: (id: string) => Promise<Pick<StoredImage, "contentType" | "data"> | undefined>,
): Promise<{ state: T; missing: number }> {
  let missing = 0;
  const products = [];
  for (const product of state.products) {
    const id = imageIdFromUrl(product.imageUrl);
    if (!id) {
      products.push(product);
      continue;
    }
    const image = await load(id);
    if (!image) missing++;
    products.push({ ...product, imageUrl: image ? dataUrlOf(image) : undefined });
  }
  return { state: { ...state, products }, missing };
}
