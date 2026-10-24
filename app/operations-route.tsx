import { requireUser } from "./auth";
import { OperationsApp } from "@/components/summon-app";
import type { PageId } from "@/lib/navigation";

export async function OperationsRoute({ initialPage = "dashboard", initialRecord, returnPath = "/" }: { initialPage?: PageId; initialRecord?: string; returnPath?: string }) {
  const user = await requireUser(returnPath);
  return <OperationsApp user={user.displayName} signOut="/api/sessao/sair" initialPage={initialPage} initialRecord={initialRecord} />;
}
