"use client";

import { PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export const n=(f:FormData,k:string)=>Number(f.get(k))||0;

export const s=(f:FormData,k:string)=>String(f.get(k)||"").trim();

export const dateLabel=(v?:string)=>v?new Intl.DateTimeFormat("pt-BR").format(new Date(v.length===10?v+"T12:00:00":v)):"—";

export const channelLabel={direct:"Venda direta",shopee:"Shopee",ml:"Mercado Livre",other:"Outro"};

export const statusLabel=(v:string)=>v.replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());

export function Field({label,name,type="text",value,step,required=false,placeholder,className=""}:{label:string,name:string,type?:string,value?:number|string,step?:string,required?:boolean,placeholder?:string,className?:string}){
  return <label className={"field "+className}><span>{label}</span><Input name={name} type={type} defaultValue={value} step={step} required={required} placeholder={placeholder}/></label>
}

export function SelectField({label,name,value,children,className=""}:{label:string,name:string,value?:string,children:any,className?:string}){return <label className={"field "+className}><span>{label}</span><select name={name} defaultValue={value}>{children}</select></label>}

/** Reduz a foto (lado maior 900 px, WebP) e devolve como texto, gravado junto com o produto. Uma foto de celular de 3 MB vira cerca de 60 KB. */
export async function compressImage(file:File):Promise<string>{
  if(!/^image\/(jpeg|png|webp)$/.test(file.type))throw new Error("Envie uma foto JPG, PNG ou WebP");
  if(file.size>15_000_000)throw new Error("A foto passa de 15 MB. Escolha uma menor.");
  const bitmap=await createImageBitmap(file),scale=Math.min(1,900/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement("canvas");
  canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);
  canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  return canvas.toDataURL("image/webp",.82);
}

export function PageHead({title,description,action}:{title:string,description:string,action?:any}){return <div className="page-head"><div><h1>{title}</h1><p>{description}</p></div>{action}</div>}

export function Empty({title,description}:{title:string,description:string}){return <div className="empty"><PackageSearch/><strong>{title}</strong><p>{description}</p></div>}

export function Stat({label,value,detail,tone="blue",onClick}:{label:string,value:string,detail?:string,tone?:string,onClick?:()=>void}){return <Card className={`stat stat-${tone} ${onClick?"stat-action":""}`} onClick={onClick} onKeyDown={e=>onClick&&["Enter"," "].includes(e.key)&&onClick()} role={onClick?"button":undefined} tabIndex={onClick?0:undefined}><CardContent><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</CardContent></Card>}

export function SaveButton({saving,children}:{saving:boolean,children:any}){return <Button disabled={saving} type="submit">{saving?"Salvando…":children}</Button>}

export function DataTable({headers,children}:{headers:string[],children:any}){return <div className="table-wrap"><table><thead><tr>{headers.map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{children}</tbody></table></div>}

export function Section({title,description,children}:{title:string,description?:string,children:any}){return <Card><CardHeader><CardTitle>{title}</CardTitle>{description&&<p className="muted">{description}</p>}</CardHeader><CardContent>{children}</CardContent></Card>}

export const csvCell=(value:string|number)=>typeof value==="number"?value.toFixed(2).replace(".",","):`"${String(value??"").replaceAll('"','""')}"`;

/** CSV que o Excel em português abre certo: marca UTF-8, ponto e vírgula e vírgula decimal. */
export function downloadCsv(filename:string,rows:(string|number)[][]){
  const blob=new Blob(["﻿"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");
  a.href=URL.createObjectURL(blob);a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
