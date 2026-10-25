import test from "node:test";
import assert from "node:assert/strict";
import {
  extractInlineImages,
  imageFromBytes,
  imageFromDataUrl,
  imageIdFromUrl,
  imageUrl,
  inlineStoredImages,
  referencedImageIds,
  sniffImageType,
  type StoredImage,
} from "./images.ts";
import { deleteOrphanImages } from "../db/image-repository.ts";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const WEBP = Uint8Array.from([...new TextEncoder().encode("RIFF"), 0, 0, 0, 0, ...new TextEncoder().encode("WEBPVP8 "), 9]);
const pngUrl = `data:image/png;base64,${Buffer.from(PNG).toString("base64")}`;
const product = (id: string, imageUrl?: string) => ({ id, name: id, imageUrl }) as any;

test("reconhece o tipo da foto pelos bytes, não pelo nome", () => {
  assert.equal(sniffImageType(PNG), "image/png");
  assert.equal(sniffImageType(WEBP), "image/webp");
  assert.equal(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImageType(new TextEncoder().encode("<svg onload=alert(1)>")), undefined);
  assert.throws(() => imageFromBytes(new TextEncoder().encode("<html>")), /JPG, PNG ou WebP/);
  assert.throws(() => imageFromBytes(new Uint8Array(2_000_001).fill(0xff)), /2 MB/);
});

test("foto embutida vira foto guardada e volta igual", () => {
  const image = imageFromDataUrl(pngUrl);
  assert.equal(image.contentType, "image/png");
  assert.equal(image.bytes, PNG.length);
  assert.throws(() => imageFromDataUrl("data:image/svg+xml;base64,PHN2Zz4="), /formato desconhecido/);
});

test("só aceita endereços de foto com id de 32 caracteres hexadecimais", () => {
  const id = "0123456789abcdef0123456789abcdef";
  assert.equal(imageIdFromUrl(imageUrl(id)), id);
  assert.equal(imageIdFromUrl("/api/imagens/../state"), undefined);
  assert.equal(imageIdFromUrl("https://exemplo.com/foto.png"), undefined);
  assert.equal(imageIdFromUrl(undefined), undefined);
});

test("separa as fotos embutidas, guarda cada foto repetida uma vez só e descarta a ilegível", async () => {
  const stored: StoredImage[] = [];
  const state = {
    products: [
      product("a", pngUrl),
      product("b", pngUrl),
      product("c", "data:image/png;base64,AAAA"),
      product("d"),
      product("e", "/api/imagens/" + "f".repeat(32)),
    ],
  };
  const result = await extractInlineImages(state, async (image) => {
    stored.push(image);
    return String(stored.length).padStart(32, "0");
  });
  assert.equal(stored.length, 1);
  assert.equal(result.moved, 2);
  assert.equal(result.dropped, 1);
  assert.equal(result.state.products[0].imageUrl, imageUrl("0".repeat(31) + "1"));
  assert.equal(result.state.products[1].imageUrl, result.state.products[0].imageUrl);
  assert.equal(result.state.products[2].imageUrl, undefined);
  assert.equal(result.state.products[3].imageUrl, undefined);
  assert.equal(result.state.products[4].imageUrl, "/api/imagens/" + "f".repeat(32));
  assert.equal(state.products[0].imageUrl, pngUrl, "não altera o estado original");

  const unchanged = { products: [product("x")] };
  assert.equal((await extractInlineImages(unchanged, async () => "x")).state, unchanged);
});

test("backup leva as fotos dentro do arquivo e avisa a que sumiu", async () => {
  const id = "a".repeat(32),
    gone = "b".repeat(32);
  const image = imageFromDataUrl(pngUrl);
  const state = { products: [product("a", imageUrl(id)), product("b", imageUrl(gone)), product("c")] };
  const result = await inlineStoredImages(state, async (wanted) => (wanted === id ? image : undefined));
  assert.equal(result.state.products[0].imageUrl, pngUrl);
  assert.equal(result.state.products[1].imageUrl, undefined);
  assert.equal(result.missing, 1);
  assert.deepEqual([...referencedImageIds(state)].sort(), [id, gone]);
});

test("apaga só fotos sem produto e mais antigas que o prazo", async () => {
  const now = new Date("2026-10-24T12:00:00Z");
  const rows = [
    { id: "usada", created_at: "2026-01-01T00:00:00Z" },
    { id: "orfa-antiga", created_at: "2026-01-01T00:00:00Z" },
    { id: "orfa-nova", created_at: "2026-10-20T00:00:00Z" },
  ];
  const deleted: unknown[] = [];
  const db: any = {
    kind: "libsql",
    all: async (_sql: string, args: unknown[]) => rows.filter((row) => row.created_at < String(args[1])),
    first: async () => undefined,
    batch: async (statements: { args: unknown[] }[]) => deleted.push(...statements.map((s) => s.args[0])),
  };
  assert.equal(await deleteOrphanImages(db, "dono", new Set(["usada"]), 30, now), 1);
  assert.deepEqual(deleted, ["orfa-antiga"]);
});
