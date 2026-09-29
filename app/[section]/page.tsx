import {notFound} from "next/navigation";
import {OperationsRoute} from "../operations-route";
import {pageFromPath} from "@/lib/navigation";

export const dynamic="force-dynamic";

export default async function SectionPage({params}:{params:Promise<{section:string}>}){
  const {section}=await params;
  const path=`/${section}`;
  const page=pageFromPath(path);
  if(!page||page==="dashboard")notFound();
  return <OperationsRoute initialPage={page} returnPath={path}/>;
}
