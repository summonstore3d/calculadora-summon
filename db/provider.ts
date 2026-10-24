import { createClient, type Client, type InValue } from "@libsql/client/web";
import { portableSchema } from "./portable-schema";

export type SqlStatement = { sql: string; args?: unknown[] };
export type SqlRow = Record<string, unknown>;
export type DatabaseProvider = {
  kind: "libsql";
  all<T extends SqlRow = SqlRow>(sql: string, args?: unknown[]): Promise<T[]>;
  first<T extends SqlRow = SqlRow>(sql: string, args?: unknown[]): Promise<T | undefined>;
  batch(statements: SqlStatement[]): Promise<void>;
};

let client: Client | undefined;
let ready: Promise<void> | undefined;

function prepare() {
  // Cria tabelas e índices que faltarem. Se falhar (rede, token), tenta de novo na próxima chamada
  // em vez de deixar o servidor preso no erro até reiniciar.
  ready ||= (async () => {
    for (const sql of portableSchema) await client!.execute(sql);
  })().catch((error) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** Banco Turso (libSQL). Sem TURSO_DATABASE_URL e TURSO_AUTH_TOKEN, o sistema funciona só no navegador. */
export function getDatabaseProvider(): DatabaseProvider | undefined {
  const url = process.env.TURSO_DATABASE_URL, authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url || !authToken) return undefined;
  client ||= createClient({ url, authToken });
  const rows = (result: { rows: unknown[] }) => result.rows.map((row) => Object.fromEntries(Object.entries(row as object)));
  return {
    kind: "libsql",
    async all<T extends SqlRow>(sql: string, args: unknown[] = []) {
      await prepare();
      return rows(await client!.execute({ sql, args: args as InValue[] })) as T[];
    },
    async first<T extends SqlRow>(sql: string, args: unknown[] = []) {
      await prepare();
      return rows(await client!.execute({ sql, args: args as InValue[] }))[0] as T | undefined;
    },
    async batch(statements: SqlStatement[]) {
      if (!statements.length) return;
      await prepare();
      await client!.batch(statements.map((statement) => ({ sql: statement.sql, args: (statement.args || []) as InValue[] })), "write");
    },
  };
}
