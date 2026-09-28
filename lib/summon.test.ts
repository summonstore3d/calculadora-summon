import test from "node:test";
import assert from "node:assert/strict";
import {buildProduction,calculateCost,completeSale,defaults,emptyState,financialBreakdown,returnSale,transitionOrder,type AppState} from "./summon.ts";

const snapshot=calculateCost({parts:[{materialId:"m1",name:"PLA azul",weightGrams:100,costPerKg:100}],hours:2,manualHours:.5,wastePercent:10,failurePercent:5,other:2,unitsPerPrint:1},defaults);

test("precificação considera todos os centros de custo e preserva margem",()=>{
  assert.equal(snapshot.material,11);
  assert.ok(snapshot.energy>0);
  assert.ok(snapshot.depreciation>0);
  assert.ok(snapshot.labor>0);
  assert.ok(snapshot.directPrice>snapshot.unitCost);
  assert.ok(snapshot.shopeePrice>snapshot.directPrice);
});

function fixture():AppState{
  const recipe={id:"r1",productId:"p1",version:1,parts:[{materialId:"m1",name:"PLA azul",weightGrams:100,costPerKg:100}],wastePercent:0,failurePercent:0,printHours:2,manualHours:0,unitsPerPrint:1,snapshot,createdAt:"2026-01-01T00:00:00Z"};
  const product={id:"p1",sku:"P1",name:"Peça",description:"",category:"Teste",universe:"",tags:[],dimensions:"",leadDays:1,minimumStock:0,fulfillment:"ready" as const,status:"active" as const,activeRecipeId:"r1",readyStock:0,snapshot,createdAt:"2026-01-01T00:00:00Z"};
  return{...emptyState,materials:[{id:"m1",brand:"A",type:"PLA",color:"Azul",unit:"kg",location:"",stockGrams:1000,averageCost:100,minimumGrams:100,status:"active"}],products:[product],recipes:[recipe],productionOrders:[{id:"op1",number:"OP-1",productId:"p1",recipeVersionId:"r1",plannedQuantity:2,approvedQuantity:0,lostQuantity:0,priority:"normal",status:"planejada",plannedConsumption:[],actualConsumption:[],actualHours:0,lossReason:"",note:"",createdAt:"2026-01-01T00:00:00Z"}]};
}

test("produção consome material e cria lote com custo histórico",()=>{
  const next=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:4,lossReason:"",note:""});
  assert.equal(next.materials[0].stockGrams,800);
  assert.equal(next.lots.length,1);
  assert.equal(next.lots[0].balance,2);
  assert.equal(next.products[0].readyStock,2);
  assert.equal(next.productionOrders[0].status,"concluida");
  assert.equal(next.lots[0].costBreakdown?.total,next.lots[0].unitCost*2);
  assert.equal(next.lots[0].costBreakdown?.materials,20);
});

test("venda usa FIFO, desconta anúncios e devolução restaura o lote",()=>{
  let state=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:4,lossReason:"",note:""});
  state={...state,orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}],status:"pronto",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:100,netRevenue:100,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  const sold=completeSale(state,"o1",20);
  assert.equal(sold.lots[0].balance,1);
  assert.equal(sold.products[0].readyStock,1);
  assert.equal(sold.orders[0].items[0].adsAllocated,20);
  assert.ok(sold.orders[0].profit<80);
  const result=financialBreakdown(sold.orders[0]);
  assert.equal(result.calculatedProfit,sold.orders[0].profit);
  assert.equal(result.difference,0);
  const returned=returnSale(sold,"o1");
  assert.equal(returned.lots[0].balance,2);
  assert.equal(returned.products[0].readyStock,2);
});

test("composição financeira identifica prejuízo e custos anormais",()=>{
  const order={...emptyState.orders[0],id:"o-loss",number:"PV-LOSS",customerName:"Cliente",channel:"direct" as const,seller:"",items:[],status:"concluido" as const,discount:0,fees:5,taxes:3,shippingCharged:0,shippingPaid:20,advertisingCost:40,otherCosts:1500,paymentMethod:"",paymentStatus:"pendente" as const,origin:"",addressSnapshot:"",note:"",gross:100,netRevenue:100,cost:25,profit:-1493,margin:-1493,stockApplied:true,createdAt:"2026-01-02T00:00:00Z"};
  const result=financialBreakdown(order);
  assert.equal(result.calculatedProfit,-1493);
  assert.equal(result.margin,-1493);
  assert.ok(result.anomalies.some(message=>message.includes("prejuízo")));
  assert.ok(result.anomalies.some(message=>message.includes("Outros custos")));
});

test("produção aceita consumo real e usa o apontamento no estoque",()=>{
  const next=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:3,manualHours:1,actualConsumption:[{materialId:"m1",name:"PLA azul",weightGrams:230,costPerKg:100}],lossReason:"",note:""});
  assert.equal(next.materials[0].stockGrams,770);
  assert.equal(next.productionOrders[0].actualConsumption[0].weightGrams,230);
});

test("aprovação sem estoque cria produção vinculada",()=>{
  let state:AppState={...fixture(),orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:0,netRevenue:0,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  state.orders[0].items=[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}];
  state=transitionOrder(state,"o1","aprovado");
  assert.equal(state.orders[0].status,"producao");
  const linked=state.productionOrders.find(p=>p.salesOrderId==="o1");
  assert.equal(linked?.plannedQuantity,1);
  assert.deepEqual(state.orders[0].productionOrderIds,[linked?.id]);
  assert.throws(()=>transitionOrder(state,"o1","concluido"));
});

test("aprovação com estoque separa por FIFO sem descontar novamente na venda",()=>{
  let state=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:4,lossReason:"",note:""});
  state={...state,orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:100,netRevenue:100,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  state=transitionOrder(state,"o1","aprovado");
  assert.equal(state.orders[0].status,"pronto");
  assert.equal(state.orders[0].stockAllocated,true);
  assert.equal(state.products[0].readyStock,1);
  assert.equal(state.lots[0].balance,1);
  const sold=completeSale(state,"o1",0);
  assert.equal(sold.products[0].readyStock,1);
  assert.equal(sold.lots[0].balance,1);
});

test("produção vinculada deixa o pedido pronto e cancelamento devolve estoque",()=>{
  let state:AppState={...fixture(),productionOrders:[],orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:100,netRevenue:100,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  state=transitionOrder(state,"o1","aprovado");
  const productionId=state.orders[0].productionOrderIds![0];
  state=buildProduction(state,productionId,{approved:1,lost:0,hours:2,lossReason:"",note:""});
  assert.equal(state.orders[0].status,"pronto");
  assert.equal(state.orders[0].stockAllocated,true);
  assert.equal(state.products[0].readyStock,0);
  state=transitionOrder(state,"o1","cancelado");
  assert.equal(state.products[0].readyStock,1);
  assert.equal(state.lots[0].balance,1);
  assert.equal(state.orders[0].stockAllocated,false);
});
