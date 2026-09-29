import type {AppState,Channel,Order,Product} from "./summon.ts";

export type DashboardPeriod = "today" | "week" | "month" | "quarter" | "year" | "custom";
export type DashboardFilters = {
  period:DashboardPeriod;
  start?:string;
  end?:string;
  channel?:Channel | "all";
  productId?:string;
  category?:string;
  universe?:string;
  campaignId?:string;
};
export type DashboardRow = {id:string;primary:string;secondary:string;value?:number;meta?:string};
export type ProductPerformance = {id:string;name:string;sku:string;revenue:number;profit:number;quantity:number;margin:number;share:number;abc:"A"|"B"|"C"};

const dayStart=(date:Date)=>{const value=new Date(date);value.setHours(0,0,0,0);return value};
const dayEnd=(date:Date)=>{const value=new Date(date);value.setHours(23,59,59,999);return value};
const parseDay=(value:string,end=false)=>{const date=new Date(`${value}T12:00:00`);return end?dayEnd(date):dayStart(date)};
const dateOf=(value?:string)=>new Date(value||0);
const sum=(values:number[])=>values.reduce((total,value)=>total+(Number(value)||0),0);
const pct=(current:number,previous:number)=>previous?(current-previous)/Math.abs(previous)*100:current?100:0;
const normalize=(value:string)=>String(value||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().replace(/\s+/g," ").toLowerCase();

export function dashboardRange(filters:DashboardFilters,reference=new Date()){
  const end=filters.period==="custom"&&filters.end?parseDay(filters.end,true):dayEnd(reference),start=dayStart(reference);
  if(filters.period==="custom"&&filters.start)start.setTime(parseDay(filters.start).getTime());
  else if(filters.period==="week")start.setDate(start.getDate()-6);
  else if(filters.period==="month")start.setDate(1);
  else if(filters.period==="quarter")start.setMonth(Math.floor(start.getMonth()/3)*3,1);
  else if(filters.period==="year")start.setMonth(0,1);
  const days=Math.max(1,Math.ceil((end.getTime()-start.getTime()+1)/86400000)),previousEnd=new Date(start.getTime()-1),previousStart=new Date(previousEnd.getTime()-(end.getTime()-start.getTime()));
  return{start,end,previousStart,previousEnd,days};
}

function orderMatches(order:Order,filters:DashboardFilters){
  if(filters.channel&&filters.channel!=="all"&&order.channel!==filters.channel)return false;
  if(filters.campaignId&&order.campaignId!==filters.campaignId)return false;
  if(filters.productId&&!order.items.some(item=>item.productId===filters.productId))return false;
  if(filters.category&&!order.items.some(item=>normalize(item.category)===normalize(filters.category!)))return false;
  if(filters.universe&&!order.items.some(item=>normalize(item.universe)===normalize(filters.universe!)))return false;
  return true;
}

function scopedItems(order:Order,filters:DashboardFilters){
  return order.items.filter(item=>(!filters.productId||item.productId===filters.productId)&&(!filters.category||normalize(item.category)===normalize(filters.category))&&(!filters.universe||normalize(item.universe)===normalize(filters.universe)));
}

function completedBetween(state:AppState,filters:DashboardFilters,start:Date,end:Date){
  return state.orders.filter(order=>order.status==="concluido"&&orderMatches(order,filters)&&dateOf(order.completedAt||order.createdAt)>=start&&dateOf(order.completedAt||order.createdAt)<=end);
}

function productScope(product:Product,filters:DashboardFilters){
  return (!filters.productId||product.id===filters.productId)&&(!filters.category||normalize(product.category)===normalize(filters.category))&&(!filters.universe||normalize(product.universe)===normalize(filters.universe));
}

export function buildDashboardAnalytics(state:AppState,filters:DashboardFilters,reference=new Date()){
  const range=dashboardRange(filters,reference),orders=completedBetween(state,filters,range.start,range.end),previousOrders=completedBetween(state,filters,range.previousStart,range.previousEnd);
  const filteredItems=orders.flatMap(order=>scopedItems(order,filters).map(item=>({order,item}))),previousItems=previousOrders.flatMap(order=>scopedItems(order,filters)),hasItemFilter=Boolean(filters.productId||filters.category||filters.universe);
  const itemRatio=(order:Order)=>{const scoped=sum(scopedItems(order,filters).map(item=>item.revenue));return order.netRevenue?Math.min(1,scoped/order.netRevenue):1};
  const netRevenue=hasItemFilter?sum(filteredItems.map(({item})=>item.revenue)):sum(orders.map(order=>order.netRevenue)),grossRevenue=sum(orders.map(order=>order.gross*itemRatio(order))),salesProfit=hasItemFilter?sum(filteredItems.map(({item})=>item.profit)):sum(orders.map(order=>order.profit)),previousNet=hasItemFilter?sum(previousItems.map(item=>item.revenue)):sum(previousOrders.map(order=>order.netRevenue));
  const expenses=state.expenses.filter(expense=>expense.status==="pago"&&dateOf(expense.paidAt||expense.dueDate)>=range.start&&dateOf(expense.paidAt||expense.dueDate)<=range.end),hasDimensionFilter=Boolean((filters.channel&&filters.channel!=="all")||filters.productId||filters.category||filters.universe||filters.campaignId),allPeriodRevenue=sum(state.orders.filter(order=>order.status==="concluido"&&dateOf(order.completedAt||order.createdAt)>=range.start&&dateOf(order.completedAt||order.createdAt)<=range.end).map(order=>order.netRevenue)),expenseShare=hasDimensionFilter&&allPeriodRevenue?Math.min(1,netRevenue/allPeriodRevenue):1,operatingExpenses=sum(expenses.map(expense=>expense.amount))*expenseShare,operatingProfit=salesProfit-operatingExpenses;
  const orderIds=new Set(orders.map(order=>order.id)),cashOrderIds=new Set(state.orders.filter(order=>orderMatches(order,filters)).map(order=>order.id)),payments=state.payments.filter(payment=>cashOrderIds.has(payment.orderId)&&payment.status!=="estornado"&&payment.received>0&&dateOf(payment.receivedAt||payment.dueDate)>=range.start&&dateOf(payment.receivedAt||payment.dueDate)<=range.end),cashReceived=sum(payments.map(payment=>payment.received)),receivables=Math.max(0,netRevenue-sum(state.payments.filter(payment=>orderIds.has(payment.orderId)&&payment.status!=="estornado").map(payment=>payment.received)));
  const advertising=sum(orders.map(order=>order.advertisingCost*itemRatio(order))),sold=sum(filteredItems.map(({item})=>item.quantity)),newCustomers=state.customers.filter(customer=>dateOf(customer.createdAt)>=range.start&&dateOf(customer.createdAt)<=range.end).length;
  const productions=state.productionOrders.filter(order=>order.status==="concluida"&&dateOf(order.completedAt||order.createdAt)>=range.start&&dateOf(order.completedAt||order.createdAt)<=range.end&&(!filters.productId||order.productId===filters.productId)),produced=sum(productions.map(order=>order.approvedQuantity)),machineHours=sum(productions.map(order=>order.actualHours));
  const openOrders=state.orders.filter(order=>!["concluido","cancelado","devolvido"].includes(order.status)&&orderMatches(order,filters)),awaitingProduction=state.productionOrders.filter(order=>["planejada","aguardando_material","fila"].includes(order.status)&&(!filters.productId||order.productId===filters.productId)),overdueProduction=state.productionOrders.filter(order=>!["concluida","cancelada"].includes(order.status)&&Boolean(order.dueDate)&&dateOf(order.dueDate)<dayStart(reference)&&(!filters.productId||order.productId===filters.productId));
  const lowMaterials=state.materials.filter(material=>material.status==="active"&&material.stockGrams<=material.minimumGrams),scopedProducts=state.products.filter(product=>product.status!=="archived"&&productScope(product,filters)),lowProducts=scopedProducts.filter(product=>product.status==="active"&&product.readyStock<=product.minimumStock);
  const materialCapital=sum(state.materials.filter(material=>material.status==="active").map(material=>material.stockGrams/1000*material.averageCost)),productCapital=sum(state.lots.filter(lot=>lot.balance>0).map(lot=>lot.balance*lot.unitCost));
  const productMap=new Map<string,ProductPerformance>();
  filteredItems.forEach(({item})=>{const current=productMap.get(item.productId)||{id:item.productId,name:item.productName,sku:item.productSku,revenue:0,profit:0,quantity:0,margin:0,share:0,abc:"C" as const};current.revenue+=item.revenue;current.profit+=item.profit;current.quantity+=item.quantity;productMap.set(item.productId,current)});
  const performances=[...productMap.values()].sort((a,b)=>b.revenue-a.revenue),totalProductRevenue=sum(performances.map(product=>product.revenue));let cumulative=0;performances.forEach(product=>{product.margin=product.revenue?product.profit/product.revenue*100:0;product.share=totalProductRevenue?product.revenue/totalProductRevenue*100:0;cumulative+=product.share;product.abc=cumulative<=80?"A":cumulative<=95?"B":"C"});
  const salesDays=Math.max(1,range.days),coverage=scopedProducts.map(product=>{const quantity=performances.find(item=>item.id===product.id)?.quantity||0,dailyAverage=quantity/salesDays;return{id:product.id,name:product.name,stock:product.readyStock,dailyAverage,days:dailyAverage?product.readyStock/dailyAverage:null,minimum:product.minimumStock}}).filter(item=>item.stock>0||item.dailyAverage>0).sort((a,b)=>(a.days??99999)-(b.days??99999));
  const activeProduction=state.productionOrders.filter(order=>!["concluida","cancelada"].includes(order.status)),purchaseForecast=state.materials.filter(material=>material.status==="active").map(material=>{const planned=sum(activeProduction.flatMap(order=>order.plannedConsumption).filter(part=>part.materialId===material.id).map(part=>part.weightGrams)),needed=Math.max(0,material.minimumGrams+planned-material.stockGrams);return{id:material.id,name:`${material.type} ${material.color}`,brand:material.brand,stockGrams:material.stockGrams,plannedGrams:planned,neededGrams:needed}}).filter(item=>item.neededGrams>0).sort((a,b)=>b.neededGrams-a.neededGrams);
  const seriesMap=new Map<string,{name:string;vendas:number;lucro:number}>();orders.forEach(order=>{const date=dateOf(order.completedAt||order.createdAt),monthly=range.days>120,key=monthly?`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`:`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`,label=monthly?date.toLocaleDateString("pt-BR",{month:"short",year:"2-digit"}):date.toLocaleDateString("pt-BR",{day:"2-digit",month:"2-digit"}),current=seriesMap.get(key)||{name:label,vendas:0,lucro:0},items=scopedItems(order,filters);current.vendas+=hasItemFilter?sum(items.map(item=>item.revenue)):order.netRevenue;current.lucro+=hasItemFilter?sum(items.map(item=>item.profit)):order.profit;seriesMap.set(key,current)});
  const timeSeries=[...seriesMap.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,value])=>value);
  const orderRows:DashboardRow[]=orders.map(order=>({id:order.id,primary:order.number,secondary:`${order.customerName} · ${dateOf(order.completedAt||order.createdAt).toLocaleDateString("pt-BR")}`,value:order.netRevenue,meta:order.channel})),productionRows:DashboardRow[]=awaitingProduction.map(order=>({id:order.id,primary:order.number,secondary:state.products.find(product=>product.id===order.productId)?.name||"Produto",value:order.plannedQuantity,meta:order.status}));
  return{range,orders,expenses,payments,grossRevenue,netRevenue,salesProfit,operatingExpenses,operatingProfit,margin:netRevenue?operatingProfit/netRevenue*100:0,variation:pct(netRevenue,previousNet),cashReceived,receivables,advertising,roas:advertising?grossRevenue/advertising:0,cac:newCustomers?advertising/newCustomers:0,newCustomers,sold,produced,machineHours,ticket:orders.length?netRevenue/orders.length:0,openOrders,awaitingProduction,overdueProduction,lowMaterials,lowProducts,materialCapital,productCapital,inventoryCapital:materialCapital+productCapital,performances,mostProfitable:[...performances].sort((a,b)=>b.profit-a.profit),mostSold:[...performances].sort((a,b)=>b.quantity-a.quantity),coverage,purchaseForecast,timeSeries,orderRows,productionRows};
}
