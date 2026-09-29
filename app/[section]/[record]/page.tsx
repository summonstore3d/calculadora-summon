import {notFound} from "next/navigation";
import {OperationsRoute} from "../../operations-route";
import {pageFromPath} from "@/lib/navigation";

export const dynamic="force-dynamic";

export default async function RecordPage({params}:{params:Promise<{section:string;record:string}>}){
  const {section,record}=await params;
  const path=`/${section}/${record}`;
  const page=pageFromPath(path);
  if(!page||page==="dashboard")notFound();
  return <OperationsRoute initialPage={page} initialRecord={decodeURIComponent(record)} returnPath={path}/>;
}
