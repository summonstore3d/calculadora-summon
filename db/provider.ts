import {env} from "cloudflare:workers";
import {createClient,type Client,type InValue} from "@libsql/client/web";
import {portableSchema} from "./portable-schema";

export type SqlStatement={sql:string;args?:unknown[]};
export type SqlRow=Record<string,unknown>;
export type DatabaseProvider={kind:"d1"|"libsql";all<T extends SqlRow=SqlRow>(sql:string,args?:unknown[]):Promise<T[]>;first<T extends SqlRow=SqlRow>(sql:string,args?:unknown[]):Promise<T|undefined>;batch(statements:SqlStatement[]):Promise<void>};

let libsqlClient:Client|undefined;
let libsqlReady:Promise<void>|undefined;

function libsqlProvider(url:string,authToken:string):DatabaseProvider{
  libsqlClient ||= createClient({url,authToken});
  libsqlReady ||= (async()=>{for(const sql of portableSchema)await libsqlClient!.execute(sql)})();
  const ready=()=>libsqlReady!;
  return{kind:"libsql",async all<T extends SqlRow>(sql:string,args:unknown[]=[]){await ready();const result=await libsqlClient!.execute({sql,args:args as InValue[]});return result.rows.map(row=>Object.fromEntries(Object.entries(row))) as T[]},async first<T extends SqlRow>(sql:string,args:unknown[]=[]){await ready();const result=await libsqlClient!.execute({sql,args:args as InValue[]}),row=result.rows[0];return row?Object.fromEntries(Object.entries(row)) as T:undefined},async batch(statements:SqlStatement[]){if(!statements.length)return;await ready();await libsqlClient!.batch(statements.map(statement=>({sql:statement.sql,args:(statement.args||[]) as InValue[]})),"write")}};
}

export function getDatabaseProvider():DatabaseProvider|undefined{
  if(env.DB){const db=env.DB;return{kind:"d1",async all<T extends SqlRow>(sql:string,args:unknown[]=[]){const result=await db.prepare(sql).bind(...args).all<T>();return(result.results||[]) as T[]},async first<T extends SqlRow>(sql:string,args:unknown[]=[]){return(await db.prepare(sql).bind(...args).first<T>())||undefined},async batch(statements:SqlStatement[]){if(!statements.length)return;await db.batch(statements.map(statement=>db.prepare(statement.sql).bind(...(statement.args||[]))))}}}
  const url=process.env.TURSO_DATABASE_URL,token=process.env.TURSO_AUTH_TOKEN;
  if(url&&token)return libsqlProvider(url,token);
  return undefined;
}
