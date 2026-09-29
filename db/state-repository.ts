import {emptyState,hydrateState,type AppState} from "../lib/summon.ts";
import type {DatabaseProvider,SqlStatement} from "./provider.ts";

type CollectionKey=Exclude<keyof AppState,"settings">;
type Descriptor={key:CollectionKey;table:string;columns:string[];values:(row:any)=>unknown[]};
const json=(value:unknown)=>JSON.stringify(value);
const amount=(value:unknown)=>Math.round((Number(value)||0)*100);
async function resolveProvider(provided?:DatabaseProvider){if(provided)return provided;const {getDatabaseProvider}=await import("./provider.ts");return getDatabaseProvider()}

const descriptors:Descriptor[]=[
  {key:"materials",table:"materials",columns:["id","user_id","brand","type","color","stock_grams","average_cost","minimum_grams","status","snapshot"],values:r=>[r.id,"$USER",r.brand,r.type,r.color,r.stockGrams,r.averageCost,r.minimumGrams,r.status,json(r)]},
  {key:"suppliers",table:"suppliers",columns:["id","user_id","name","contact","email","status","snapshot"],values:r=>[r.id,"$USER",r.name,r.contact||null,r.email||null,r.status,json(r)]},
  {key:"purchases",table:"purchase_records",columns:["id","user_id","material_id","supplier_id","weight_grams","total_cents","purchased_at","reversed_at","snapshot"],values:r=>[r.id,"$USER",r.materialId,r.supplierId||null,(Number(r.kg)||0)*1000,amount(r.total),r.date,r.reversedAt||null,json(r)]},
  {key:"products",table:"products",columns:["id","user_id","sku","name","category","universe","tags","ready_stock","status","snapshot"],values:r=>[r.id,"$USER",r.sku,r.name,r.category,r.universe||null,json(r.tags||[]),r.readyStock,r.status,json(r)]},
  {key:"recipes",table:"recipe_versions",columns:["id","user_id","product_id","version","snapshot","created_at"],values:r=>[r.id,"$USER",r.productId,r.version,json(r),r.createdAt]},
  {key:"machines",table:"machines",columns:["id","user_id","name","status","snapshot"],values:r=>[r.id,"$USER",r.name,r.status,json(r)]},
  {key:"maintenances",table:"maintenances",columns:["id","user_id","machine_id","cost_cents","performed_at","snapshot"],values:r=>[r.id,"$USER",r.machineId,amount(r.cost),r.date,json(r)]},
  {key:"productionOrders",table:"production_orders",columns:["id","user_id","number","product_id","recipe_version_id","status","snapshot","created_at","completed_at"],values:r=>[r.id,"$USER",r.number,r.productId,r.recipeVersionId,r.status,json(r),r.createdAt,r.completedAt||null]},
  {key:"lots",table:"product_lots",columns:["id","user_id","code","product_id","production_order_id","balance","unit_cost_cents","produced_at","snapshot"],values:r=>[r.id,"$USER",r.code,r.productId,r.productionOrderId,r.balance,amount(r.unitCost),r.producedAt,json(r)]},
  {key:"customers",table:"customers",columns:["id","user_id","name","phone","email","city","state","snapshot","created_at"],values:r=>[r.id,"$USER",r.name,r.phone||null,r.email||null,r.city||null,r.state||null,json(r),r.createdAt]},
  {key:"campaigns",table:"campaigns",columns:["id","user_id","name","platform","investment_cents","status","snapshot"],values:r=>[r.id,"$USER",r.name,r.platform,amount(r.investment),r.status,json(r)]},
  {key:"orders",table:"orders",columns:["id","user_id","product_id","status","quantity","channel","snapshot","created_at"],values:r=>[r.id,"$USER",r.items?.[0]?.productId||"multiple",r.status,(r.items||[]).reduce((sum:number,item:any)=>sum+(Number(item.quantity)||0),0),r.channel,json(r),r.createdAt]},
  {key:"movements",table:"movements",columns:["id","user_id","entity_type","entity_id","kind","quantity","balance_after","snapshot","created_at"],values:r=>[r.id,"$USER",r.entity,r.entityId,r.kind,r.quantity,r.balanceAfter,json(r),r.createdAt]},
  {key:"payments",table:"payments",columns:["id","user_id","order_id","expected_cents","received_cents","status","snapshot"],values:r=>[r.id,"$USER",r.orderId,amount(r.expected),amount(r.received),r.status,json(r)]},
  {key:"expenses",table:"expenses",columns:["id","user_id","description","category","amount_cents","due_date","paid_at","status","recurring","snapshot","created_at"],values:r=>[r.id,"$USER",r.description,r.category,amount(r.amount),r.dueDate,r.paidAt||null,r.status,r.recurring?1:0,json(r),r.createdAt]},
  {key:"goals",table:"goals",columns:["id","user_id","month","snapshot"],values:r=>[r.id,"$USER",r.month,json(r)]},
  {key:"calculations",table:"calculations",columns:["id","user_id","name","created_at","snapshot"],values:r=>[r.id,"$USER",r.name,r.createdAt,json(r)]},
];

type ProfileRow={version:number;settings:string;write_token:string};
const parseSnapshot=(value:unknown)=>{try{return JSON.parse(String(value||"{}"))}catch{return null}};

async function loadCollections(db:DatabaseProvider,userId:string){
  const pairs=await Promise.all(descriptors.map(async descriptor=>{
    const rows=await db.all<{snapshot:unknown}>(`SELECT snapshot FROM ${descriptor.table} WHERE user_id = ?`,[userId]);
    return[descriptor.key,rows.map(row=>parseSnapshot(row.snapshot)).filter(Boolean)] as const;
  }));
  return Object.fromEntries(pairs) as Pick<AppState,CollectionKey>;
}

export async function loadNormalizedState(db:DatabaseProvider,userId:string){
  const profile=await db.first<ProfileRow>("SELECT version, settings, write_token FROM user_profiles WHERE user_id = ?",[userId]);
  if(!profile)return undefined;
  const collections=await loadCollections(db,userId);
  return{state:hydrateState({...emptyState,...collections,settings:parseSnapshot(profile.settings)||emptyState.settings}),version:Number(profile.version)||0};
}

function rawValues(descriptor:Descriptor,row:any,userId:string){return descriptor.values(row).map(value=>value==="$USER"?userId:value)}
function guardedUpsert(descriptor:Descriptor,row:any,userId:string,token:string):SqlStatement{
  const columns=descriptor.columns,updates=columns.filter(column=>!["id","user_id"].includes(column)).map(column=>`${column}=excluded.${column}`).join(","),values=rawValues(descriptor,row,userId);
  return{sql:`INSERT INTO ${descriptor.table} (${columns.join(",")}) SELECT ${columns.map(()=>"?").join(",")} WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id=? AND write_token=?) ON CONFLICT(id) DO UPDATE SET ${updates}`,args:[...values,userId,token]};
}
function guardedDelete(table:string,id:string,userId:string,token:string):SqlStatement{return{sql:`DELETE FROM ${table} WHERE user_id=? AND id=? AND EXISTS (SELECT 1 FROM user_profiles WHERE user_id=? AND write_token=?)`,args:[userId,id,userId,token]}}

function derivedRows(state:AppState){
  const orderItems=state.orders.flatMap(order=>order.items.map(item=>({id:item.id,userId:"$USER",orderId:order.id,productId:item.productId,quantity:item.quantity,revenue:amount(item.revenue),cost:amount(item.cost),profit:amount(item.profit),snapshot:json(item)})));
  const components=state.recipes.flatMap(recipe=>recipe.parts.map((part,index)=>({id:`${recipe.id}:${index}`,userId:"$USER",recipeVersionId:recipe.id,materialId:part.materialId||"manual",weightGrams:part.weightGrams,snapshot:json(part)})));
  return{orderItems,components};
}
function derivedStatements(before:AppState|undefined,state:AppState,userId:string,token:string):SqlStatement[]{
  const previous=before?derivedRows(before):{orderItems:[],components:[]},next=derivedRows(state),guard=" WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id=? AND write_token=?)",guardArgs=[userId,token],statements:SqlStatement[]=[];
  for(const row of changedRows(previous.orderItems,next.orderItems))statements.push({sql:`INSERT INTO order_items (id,user_id,order_id,product_id,quantity,revenue_cents,cost_cents,profit_cents,snapshot) SELECT ?,?,?,?,?,?,?,?,?${guard} ON CONFLICT(id) DO UPDATE SET order_id=excluded.order_id,product_id=excluded.product_id,quantity=excluded.quantity,revenue_cents=excluded.revenue_cents,cost_cents=excluded.cost_cents,profit_cents=excluded.profit_cents,snapshot=excluded.snapshot`,args:[row.id,userId,row.orderId,row.productId,row.quantity,row.revenue,row.cost,row.profit,row.snapshot,...guardArgs]});
  for(const row of removedRows(previous.orderItems,next.orderItems))statements.push(guardedDelete("order_items",row.id,userId,token));
  for(const row of changedRows(previous.components,next.components))statements.push({sql:`INSERT INTO recipe_components (id,user_id,recipe_version_id,material_id,weight_grams,snapshot) SELECT ?,?,?,?,?,?${guard} ON CONFLICT(id) DO UPDATE SET recipe_version_id=excluded.recipe_version_id,material_id=excluded.material_id,weight_grams=excluded.weight_grams,snapshot=excluded.snapshot`,args:[row.id,userId,row.recipeVersionId,row.materialId,row.weightGrams,row.snapshot,...guardArgs]});
  for(const row of removedRows(previous.components,next.components))statements.push(guardedDelete("recipe_components",row.id,userId,token));
  return statements;
}

async function migrateLegacy(db:DatabaseProvider,userId:string){
  const legacy=await db.first<{payload:string;version:number}>("SELECT payload, version FROM app_states WHERE user_id = ?",[userId]),state=hydrateState(legacy?.payload?parseSnapshot(legacy.payload):emptyState),version=Number(legacy?.version)||0,now=new Date().toISOString(),token=crypto.randomUUID();
  const statements:SqlStatement[]=[{sql:"INSERT INTO user_profiles (user_id,version,settings,write_token,legacy_migrated_at,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(user_id) DO NOTHING",args:[userId,version,json(state.settings),token,legacy?now:null,now]}];
  for(const descriptor of descriptors)for(const row of state[descriptor.key] as any[])statements.push(guardedUpsert(descriptor,row,userId,token));
  statements.push(...derivedStatements(undefined,state,userId,token));
  statements.push({sql:"INSERT INTO audit_events (id,user_id,entity_type,entity_id,action,payload,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id=? AND write_token=?)",args:[crypto.randomUUID(),userId,"migration",userId,legacy?"legacy-normalized":"normalized-initialized",json({version,collections:descriptors.reduce((sum,d)=>sum+(state[d.key] as any[]).length,0)}),now,userId,token]});
  await db.batch(statements);
  return(await loadNormalizedState(db,userId))!;
}

export async function loadOperationalState(userId:string,providedDb?:DatabaseProvider){
  const db=await resolveProvider(providedDb);if(!db)return undefined;
  const result=(await loadNormalizedState(db,userId))||await migrateLegacy(db,userId);
  return{...result,storage:db.kind};
}

function changedRows(before:any[],after:any[]){const previous=new Map(before.map(row=>[row.id,json(row)]));return after.filter(row=>previous.get(row.id)!==json(row))}
function removedRows(before:any[],after:any[]){const next=new Set(after.map(row=>row.id));return before.filter(row=>!next.has(row.id))}

export async function saveOperationalState(userId:string,nextState:AppState,expectedVersion:number,action:string,entityType="state",entityId=userId,providedDb?:DatabaseProvider){
  const db=await resolveProvider(providedDb);if(!db)throw new Error("DATABASE_UNAVAILABLE");
  const current=await loadOperationalState(userId,db);if(!current)throw new Error("DATABASE_UNAVAILABLE");
  if(current.version!==expectedVersion)return{conflict:true,...current};
  const now=new Date().toISOString(),token=crypto.randomUUID(),nextVersion=expectedVersion+1,statements:SqlStatement[]=[{sql:"UPDATE user_profiles SET version=?,settings=?,write_token=?,updated_at=? WHERE user_id=? AND version=?",args:[nextVersion,json(nextState.settings),token,now,userId,expectedVersion]}];
  for(const descriptor of descriptors){const before=current.state[descriptor.key] as any[],after=nextState[descriptor.key] as any[];for(const row of changedRows(before,after))statements.push(guardedUpsert(descriptor,row,userId,token));for(const row of removedRows(before,after))statements.push(guardedDelete(descriptor.table,row.id,userId,token))}
  if(json(current.state.orders)!==json(nextState.orders)||json(current.state.recipes)!==json(nextState.recipes))statements.push(...derivedStatements(current.state,nextState,userId,token));
  statements.push({sql:"INSERT INTO audit_events (id,user_id,entity_type,entity_id,action,payload,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM user_profiles WHERE user_id=? AND write_token=?)",args:[crypto.randomUUID(),userId,entityType,entityId,action,json({version:nextVersion}),now,userId,token]});
  await db.batch(statements);
  const committed=await db.first<ProfileRow>("SELECT version, settings, write_token FROM user_profiles WHERE user_id = ?",[userId]);
  if(committed?.write_token!==token)return{conflict:true,...(await loadOperationalState(userId,db))!};
  return{conflict:false,version:nextVersion,updatedAt:now};
}
