export const pageRoutes = {
  dashboard: "/",
  orders: "/pedidos",
  customers: "/clientes",
  catalog: "/catalogo",
  calculator: "/calculadora",
  production: "/producao",
  stock: "/estoque",
  machines: "/maquinas",
  materials: "/materiais",
  purchases: "/compras",
  finance: "/financeiro",
  marketing: "/marketing",
  reports: "/relatorios",
  settings: "/parametros",
} as const;

export type PageId = keyof typeof pageRoutes;

export const pageTitles: Record<PageId, string> = {
  dashboard: "Dashboard",
  orders: "Pedidos",
  customers: "Clientes",
  catalog: "Catálogo",
  calculator: "Calculadora",
  production: "Kanban de produção",
  stock: "Estoque de produtos",
  machines: "Máquinas",
  materials: "Materiais",
  purchases: "Compras",
  finance: "Financeiro",
  marketing: "Marketing",
  reports: "Relatórios",
  settings: "Parâmetros",
};

const routePages = new Map<string,PageId>(
  Object.entries(pageRoutes).map(([page, path]) => [path, page as PageId]),
);

export function pageFromPath(pathname: string): PageId | undefined {
  const normalized = `/${pathname.split("?")[0].split("#")[0].split("/").filter(Boolean)[0] || ""}`;
  return routePages.get(normalized === "/" ? "/" : normalized);
}

export function pathForPage(page: string): string {
  return pageRoutes[page as PageId] || pageRoutes.dashboard;
}

export function pathForRecord(page: string, record: string): string {
  return `${pathForPage(page)}/${encodeURIComponent(record)}`;
}

export function recordFromPath(pathname: string): string | undefined {
  const segments=pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
  return segments[1] ? decodeURIComponent(segments[1]) : undefined;
}

export function isPageId(value: string): value is PageId {
  return value in pageRoutes;
}
