import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
export const dynamic="force-dynamic";
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const user=await getChatGPTUser();if(!user||!env.DB||!env.BUCKET)return new Response(null,{status:404});const {id}=await params,row=await env.DB.prepare("SELECT object_key,content_type FROM images WHERE id=? AND user_id=?").bind(id,user.userId).first<{object_key:string;content_type:string}>();if(!row)return new Response(null,{status:404});const object=await env.BUCKET.get(row.object_key);if(!object)return new Response(null,{status:404});return new Response(object.body,{headers:{"content-type":row.content_type,"cache-control":"private, max-age=3600"}})}
