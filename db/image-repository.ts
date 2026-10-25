// Fotos de produto no Turso, em base64, uma linha por foto.
import type { DatabaseProvider } from "./provider.ts";
import type { StoredImage } from "../lib/images.ts";

const newId = () => [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");

export async function storeImage(db: DatabaseProvider, userId: string, image: StoredImage) {
  const id = newId();
  await db.batch([
    {
      sql: "INSERT INTO images (id, user_id, content_type, bytes, data, created_at) VALUES (?, ?, ?, ?, ?, ?)",
      args: [id, userId, image.contentType, image.bytes, image.data, new Date().toISOString()],
    },
  ]);
  return id;
}

export async function readImage(db: DatabaseProvider, id: string, userId?: string) {
  const row = await db.first<{ content_type: string; data: string }>(
    userId
      ? "SELECT content_type, data FROM images WHERE id = ? AND user_id = ?"
      : "SELECT content_type, data FROM images WHERE id = ?",
    userId ? [id, userId] : [id],
  );
  return row ? { contentType: row.content_type as StoredImage["contentType"], data: String(row.data) } : undefined;
}

/** Apaga fotos que nenhum produto usa mais, só depois de `graceDays` (um backup antigo ou outra aba ainda pode apontar para elas). */
export async function deleteOrphanImages(
  db: DatabaseProvider,
  userId: string,
  referenced: Set<string>,
  graceDays = 30,
  now = new Date(),
) {
  const before = new Date(now.getTime() - graceDays * 86_400_000).toISOString();
  const rows = await db.all<{ id: string }>("SELECT id FROM images WHERE user_id = ? AND created_at < ?", [userId, before]);
  const orphans = rows.map((row) => String(row.id)).filter((id) => !referenced.has(id));
  if (orphans.length)
    await db.batch(orphans.map((id) => ({ sql: "DELETE FROM images WHERE id = ? AND user_id = ?", args: [id, userId] })));
  return orphans.length;
}
