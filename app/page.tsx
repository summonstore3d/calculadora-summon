import { requireChatGPTUser,chatGPTSignOutPath } from "./chatgpt-auth";
import { SummonApp } from "@/components/summon-app";
export const dynamic="force-dynamic";
export default async function Home(){const user=await requireChatGPTUser("/");return <SummonApp user={user.displayName} signOut={chatGPTSignOutPath("/")}/>}
