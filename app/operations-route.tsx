import {requireChatGPTUser,chatGPTSignOutPath} from "./chatgpt-auth";
import {OperationsApp} from "@/components/summon-app";
import {PageId} from "@/lib/navigation";

export async function OperationsRoute({initialPage="dashboard",initialRecord,returnPath="/"}:{initialPage?:PageId;initialRecord?:string;returnPath?:string}){
  const user=await requireChatGPTUser(returnPath);
  return <OperationsApp user={user.displayName} signOut={process.env.VERCEL?"#":chatGPTSignOutPath(returnPath)} initialPage={initialPage} initialRecord={initialRecord}/>;
}
