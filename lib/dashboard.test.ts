import test from "node:test";
import assert from "node:assert/strict";
import {buildDashboardAnalytics,dashboardRange} from "./dashboard.ts";
import {calculateCost,defaults,emptyState,type AppState,type Order} from "./summon.ts";

const snapshot=calculateCost({parts:[],hours:1,manualHours:0,wastePercent:0,failurePercent:0,other:10},defaults);
const product=(id:string,name:string,category:string,readyStock:number)=>({id,sku:id.toUpperCase(),name,description:"",category,universe:category==="Deckbox"?"Pokémon":"",tags:[],dimensions:"",leadDays:1,minimumStock:2,fulfillment:"ready" as const,status:"active" as const,activeRecipeId:"",readyStock,snapshot,createdAt:"2026-09-01T12:00:00Z"});
const order=(id:string,date:string,productId:string,channel:"direct"|"shopee",revenue:number,profit:number,quantity=1):Order=>({id,number:`PV-${id}`,customerName:"Cliente",channel,seller:"",items:[{id:`i-${id}`,productId,productName:productId==="p1"?"Deckbox":"Miniatura",productSku:productId.toUpperCase(),category:productId==="p1"?"Deckbox":"Decoração",universe:productId==="p1"?"Pokémon":"",quantity,unitPrice:revenue/quantity,discount:0,revenue,cost:revenue-profit,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit,margin:profit/revenue*100,lotAllocations:[]}],status:"concluido",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:10,otherCosts:0,paymentMethod:"Pix",paymentStatus:"pago",origin:"",addressSnapshot:"",note:"",gross:revenue,netRevenue:revenue,cost:revenue-profit,profit,margin:profit/revenue*100,stockApplied:true,createdAt:date,completedAt:date});

function fixture():AppState{
  return{...emptyState,
    products:[product("p1","Deckbox","Deckbox",6),product("p2","Miniatura","Decoração",2)],
    materials:[{id:"m1",brand:"Marca",type:"PLA",color:"Azul",unit:"kg",location:"",stockGrams:500,averageCost:80,minimumGrams:1000,status:"active"}],
    orders:[order("1","2026-09-20T12:00:00Z","p1","direct",200,80,2),order("2","2026-09-22T12:00:00Z","p2","shopee",100,20),order("0","2026-08-20T12:00:00Z","p1","direct",150,50)],
    payments:[{id:"pay1",orderId:"1",expected:200,received:200,dueDate:"2026-09-20",receivedAt:"2026-09-25T12:00:00Z",method:"Pix",status:"pago"}],
    expenses:[{id:"e1",description:"Aluguel",category:"Fixo",amount:30,dueDate:"2026-09-10",paidAt:"2026-09-10T12:00:00Z",recurring:true,status:"pago",note:"",createdAt:"2026-09-01T12:00:00Z"}],
    lots:[{id:"l1",code:"L1",productId:"p1",productionOrderId:"op0",recipeVersionId:"",initialQuantity:10,balance:6,unitCost:30,producedAt:"2026-09-01T12:00:00Z",note:""}],
    productionOrders:[{id:"op1",number:"OP-1",productId:"p1",recipeVersionId:"",plannedQuantity:3,approvedQuantity:0,lostQuantity:0,priority:"normal",dueDate:"2026-09-15",status:"fila",plannedConsumption:[{materialId:"m1",name:"PLA Azul",weightGrams:600,costPerKg:80}],actualConsumption:[],actualHours:0,lossReason:"",note:"",createdAt:"2026-09-10T12:00:00Z"}]
  };
}

test("período mensal calcula faixa anterior com a mesma duração",()=>{
  const range=dashboardRange({period:"month"},new Date("2026-09-29T12:00:00Z"));
  assert.equal(range.start.getDate(),1);
  assert.equal(range.end.getDate(),29);
  assert.ok(range.previousStart<range.previousEnd);
});

test("dashboard separa resultado operacional de caixa",()=>{
  const analytics=buildDashboardAnalytics(fixture(),{period:"month",channel:"all"},new Date("2026-09-29T12:00:00Z"));
  assert.equal(analytics.netRevenue,300);
  assert.equal(analytics.salesProfit,100);
  assert.equal(analytics.operatingProfit,70);
  assert.equal(analytics.cashReceived,200);
  assert.equal(analytics.receivables,100);
  assert.equal(analytics.openOrders.length,0);
});

test("filtros por canal e produto afetam vendas sem misturar o portfólio",()=>{
  const byChannel=buildDashboardAnalytics(fixture(),{period:"month",channel:"shopee"},new Date("2026-09-29T12:00:00Z"));
  assert.equal(byChannel.netRevenue,100);
  assert.deepEqual(byChannel.performances.map(item=>item.id),["p2"]);
  const byProduct=buildDashboardAnalytics(fixture(),{period:"month",channel:"all",productId:"p1"},new Date("2026-09-29T12:00:00Z"));
  assert.equal(byProduct.netRevenue,200);
  assert.equal(byProduct.sold,2);
  assert.equal(byProduct.coverage[0].name,"Deckbox");
});

test("gera curva ABC, cobertura e necessidade de compra",()=>{
  const analytics=buildDashboardAnalytics(fixture(),{period:"month",channel:"all"},new Date("2026-09-29T12:00:00Z"));
  assert.equal(analytics.performances[0].abc,"A");
  assert.equal(analytics.performances[1].abc,"C");
  assert.ok(analytics.coverage.find(item=>item.id==="p1")?.days);
  assert.equal(analytics.purchaseForecast[0].neededGrams,1100);
  assert.equal(analytics.inventoryCapital,220);
  assert.equal(analytics.overdueProduction.length,1);
});
