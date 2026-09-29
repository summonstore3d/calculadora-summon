import test from "node:test";
import assert from "node:assert/strict";
import {pageFromPath,pathForPage,pathForRecord,recordFromPath} from "./navigation.ts";
import {adjustProductStock,buildProduction,calculateCost,completeSale,defaults,emptyState,financialBreakdown,removeCustomer,removeProduct,returnSale,reversePurchase,transitionOrder,updateCustomer,updateDraftOrder,updateProduct,updatePurchase,type AppState} from "./summon.ts";

const snapshot=calculateCost({parts:[{materialId:"m1",name:"PLA azul",weightGrams:100,costPerKg:100}],hours:2,manualHours:.5,wastePercent:10,failurePercent:5,other:2,unitsPerPrint:1},defaults);

test("navegação converte páginas e registros em URLs estáveis",()=>{
  assert.equal(pathForPage("orders"),"/pedidos");
  assert.equal(pageFromPath("/pedidos/PV-00001"),"orders");
  assert.equal(pathForRecord("catalog","PRD 001"),"/catalogo/PRD%20001");
  assert.equal(recordFromPath("/catalogo/PRD%20001"),"PRD 001");
  assert.equal(pageFromPath("/rota-inexistente"),undefined);
});

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

test("produção soma linhas repetidas do mesmo material antes de baixar o estoque",()=>{
  const next=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:3,actualConsumption:[{materialId:"m1",name:"PLA azul",weightGrams:120,costPerKg:100},{materialId:"m1",name:"PLA azul",weightGrams:80,costPerKg:100}],lossReason:"",note:""});
  assert.equal(next.materials[0].stockGrams,800);
  assert.equal(next.productionOrders[0].actualConsumption.length,1);
  assert.equal(next.productionOrders[0].actualConsumption[0].weightGrams,200);
});

test("perda total consome materiais sem criar lote vazio",()=>{
  const next=buildProduction(fixture(),"op1",{approved:0,lost:2,hours:3,actualConsumption:[{materialId:"m1",name:"PLA azul",weightGrams:210,costPerKg:100}],lossReason:"Falha de adesão",note:"Mesa contaminada"});
  assert.equal(next.materials[0].stockGrams,790);
  assert.equal(next.lots.length,0);
  assert.equal(next.products[0].readyStock,0);
  assert.equal(next.productionOrders[0].lostQuantity,2);
  assert.equal(next.productionOrders[0].lotId,undefined);
  assert.throws(()=>buildProduction(fixture(),"op1",{approved:0,lost:2,hours:3,lossReason:"",note:""}));
});

test("aprovação sem estoque cria produção vinculada",()=>{
  let state:AppState={...fixture(),orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:0,netRevenue:0,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  state.orders[0].items=[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}];
  state=transitionOrder(state,"o1","aprovado");
  assert.equal(state.orders[0].status,"producao");
  const linked=state.productionOrders.find(p=>p.salesOrderId==="o1");
  assert.equal(linked?.plannedQuantity,1);
  assert.deepEqual(state.orders[0].productionOrderIds,[linked?.id]);
  assert.equal(state.orders[0].history?.at(-1)?.status,"producao");
  assert.throws(()=>transitionOrder(state,"o1","concluido"));
});

test("orçamento pode ser editado com recálculo e histórico",()=>{
  let state:AppState={...fixture(),orders:[{id:"o1",number:"PV-1",customerName:"Cliente",channel:"direct",seller:"",items:[{id:"i1",productId:"p1",productName:"Peça",productSku:"P1",category:"Teste",universe:"",quantity:1,unitPrice:100,discount:0,revenue:100,cost:0,fees:0,taxes:0,adsAllocated:0,otherAllocated:0,profit:0,margin:0,lotAllocations:[]}],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:100,netRevenue:100,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}],payments:[{id:"pay1",orderId:"o1",expected:100,received:0,dueDate:"2026-01-10",method:"",status:"pendente"}]};
  state=updateDraftOrder(state,"o1",{customerName:"Cliente editado",channel:"shopee",seller:"Ana",discount:10,shippingCharged:5,shippingPaid:8,otherCosts:3,paymentMethod:"Pix",origin:"Instagram",note:"Revisado",items:[{id:"i1",quantity:2,unitPrice:90,discount:4}]});
  assert.equal(state.orders[0].netRevenue,171);
  assert.equal(state.orders[0].items[0].revenue,176);
  assert.equal(state.orders[0].customerName,"Cliente editado");
  assert.equal(state.orders[0].history?.at(-1)?.note,"Orçamento editado");
  assert.equal(state.payments[0].expected,171);
  state=transitionOrder(state,"o1","aprovado");
  assert.throws(()=>updateDraftOrder(state,"o1",{customerName:"X",channel:"direct",seller:"",discount:0,shippingCharged:0,shippingPaid:0,otherCosts:0,paymentMethod:"",origin:"",note:"",items:[]}));
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

test("catálogo edita dados e arquiva produto com histórico",()=>{
  let state=fixture();
  state=updateProduct(state,"p1",{name:"Peça nova",sku:"P2",description:"Descrição",category:"Deckbox",universe:"Pokémon",tags:["TCG"],dimensions:"10 cm",leadDays:3,minimumStock:2,fulfillment:"hybrid",status:"active"});
  assert.equal(state.products[0].name,"Peça nova");
  state=buildProduction(state,"op1",{approved:1,lost:0,hours:2,lossReason:"",note:""});
  const removed=removeProduct(state,"p1");
  assert.equal(removed.archived,true);
  assert.equal(removed.state.products[0].status,"archived");
});

test("cliente sem pedido é excluído e cliente vinculado é arquivado",()=>{
  const customer={id:"c1",name:"Ana",phone:"1",email:"a@a.com",document:"",zip:"",city:"Porto Alegre",state:"RS",address:"",origin:"Ads",tags:[],note:"",consent:true,status:"active" as const,createdAt:"2026-01-01T00:00:00Z"};
  let state:AppState={...fixture(),customers:[customer]};
  state=updateCustomer(state,"c1",{...customer,name:"Ana Maria",status:"active"});
  assert.equal(state.customers[0].name,"Ana Maria");
  assert.equal(removeCustomer(state,"c1").state.customers.length,0);
  state={...state,orders:[{id:"o1",number:"PV-1",customerId:"c1",customerName:"Ana",channel:"direct",seller:"",items:[],status:"orcamento",discount:0,fees:0,taxes:0,shippingCharged:0,shippingPaid:0,advertisingCost:0,otherCosts:0,paymentMethod:"",paymentStatus:"pendente",origin:"",addressSnapshot:"",note:"",gross:0,netRevenue:0,cost:0,profit:0,margin:0,stockApplied:false,createdAt:"2026-01-02T00:00:00Z"}]};
  const removed=removeCustomer(state,"c1");
  assert.equal(removed.archived,true);
  assert.equal(removed.state.customers[0].status,"archived");
});

test("compra pode editar metadados e estornar com auditoria",()=>{
  const purchase={id:"buy1",materialId:"m1",kg:.5,subtotal:40,freight:10,total:50,date:"2026-01-01",note:""};
  let state:AppState={...fixture(),purchases:[purchase]};
  state=updatePurchase(state,"buy1",{date:"2026-01-02",note:"NF 10"});
  assert.equal(state.purchases[0].note,"NF 10");
  state=reversePurchase(state,"buy1","Duplicada");
  assert.equal(state.materials[0].stockGrams,500);
  assert.ok(state.purchases[0].reversedAt);
  assert.equal(state.movements.at(-1)?.kind,"purchase-reversal");
});

test("inventário de produto ajusta lote, saldo agregado e histórico",()=>{
  let state=buildProduction(fixture(),"op1",{approved:2,lost:0,hours:4,lossReason:"",note:""});
  state=adjustProductStock(state,state.lots[0].id,{operation:"remove",quantity:1,reason:"Avaria"});
  assert.equal(state.lots[0].balance,1);
  assert.equal(state.products[0].readyStock,1);
  assert.equal(state.movements.at(-1)?.kind,"inventory-adjustment");
  assert.throws(()=>adjustProductStock(state,state.lots[0].id,{operation:"remove",quantity:2,reason:"Erro"}));
});
