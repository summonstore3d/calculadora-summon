import { requireChatGPTUser,chatGPTSignOutPath } from "./chatgpt-auth";
import { OperationsApp } from "@/components/summon-app";
export const dynamic="force-dynamic";
export default async function Home(){const user=await requireChatGPTUser("/");return <OperationsApp user={user.displayName} signOut={process.env.VERCEL?"#":chatGPTSignOutPath("/")}/>}
