import test from "node:test";
import assert from "node:assert/strict";
import {createClient,type InValue} from "@libsql/client";
import {portableSchema} from "../db/portable-schema.ts";
import {loadOperationalState,saveOperationalState} from "../db/state-repository.ts";
import {emptyState,type AppState} from "./summon.ts";
import type {DatabaseProvider,SqlRow} from "../db/provider.ts";

async function database():Promise<DatabaseProvider>{
  const client=createClient({url:"file::memory:"});
  for(const sql of portableSchema)await client.execute(sql);
  const all=async<T extends SqlRow>(sql:string,args:unknown[]=[]):Promise<T[]>=>{const result=await client.execute({sql,args:args as InValue[]});return result.rows.map(row=>Object.fromEntries(Object.entries(row))) as T[]};
  return{kind:"libsql",all,async first<T extends SqlRow>(sql:string,args:unknown[]=[]):Promise<T|undefined>{const rows=await all<T>(sql,args);return rows[0] as T|undefined},async batch(statements){await client.batch(statements.map(statement=>({sql:statement.sql,args:(statement.args||[]) as InValue[]})),"write")}};
}

test("migração normaliza o legado e grava apenas registros transacionais",async()=>{
  const db=await database(),userId="owner-test",legacy:AppState={...emptyState,materials:[{id:"mat-1",brand:"F3D",type:"PLA",color:"Branco",unit:"kg",location:"A1",stockGrams:1000,averageCost:90,minimumGrams:250,status:"active"}],products:[],calculations:[],orders:[]};
  await db.batch([{sql:"INSERT INTO app_states (user_id,version,payload,updated_at) VALUES (?,?,?,?)",args:[userId,7,JSON.stringify(legacy),new Date().toISOString()]}]);
  const migrated=await loadOperationalState(userId,db);
  assert.equal(migrated?.version,7);
  assert.equal(migrated?.state.materials[0].stockGrams,1000);
  assert.equal((await db.first<{count:number}>("SELECT COUNT(*) AS count FROM materials WHERE user_id=?",[userId]))?.count,1);
  const cost={material:10,energy:1,depreciation:1,labor:1,failure:0,maintenance:0,other:0,total:13,unitCost:13,directPrice:25,shopeePrice:30,mlPrice:29,directProfit:12,directMargin:48,settings:emptyState.settings},createdAt=new Date().toISOString(),next:AppState={...migrated!.state,materials:[{...migrated!.state.materials[0],stockGrams:1500}],recipes:[{id:"recipe-1",productId:"prod-1",version:1,parts:[{materialId:"mat-1",name:"PLA Branco",weightGrams:120,costPerKg:90}],wastePercent:5,failurePercent:2,printHours:3,manualHours:.2,unitsPerPrint:1,snapshot:cost,createdAt}],calculations:[{id:"calc-1",name:"Peça",weightGrams:120,wastePercent:5,snapshot:cost,createdAt}]};
  const saved=await saveOperationalState(userId,next,7,"inventory-adjustment","material","mat-1",db);
  assert.equal(saved.conflict,false);
  assert.equal(saved.version,8);
  assert.equal(Number((await db.first<{stock_grams:number}>("SELECT stock_grams FROM materials WHERE id=?",["mat-1"]))?.stock_grams),1500);
  assert.equal((await db.first<{count:number}>("SELECT COUNT(*) AS count FROM calculations WHERE user_id=?",[userId]))?.count,1);
  assert.equal((await db.first<{count:number}>("SELECT COUNT(*) AS count FROM recipe_components WHERE user_id=?",[userId]))?.count,1);
  assert.equal((await db.first<{count:number}>("SELECT COUNT(*) AS count FROM audit_events WHERE user_id=?",[userId]))?.count,2);
  const stale=await saveOperationalState(userId,next,7,"stale-write","state",userId,db);
  assert.equal(stale.conflict,true);
});
