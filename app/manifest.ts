import type { MetadataRoute } from "next";

/** Permite "Adicionar à tela inicial": abre como app, sem a barra do navegador. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gestão de produção 3D",
    short_name: "Gestão 3D",
    description: "Custos, insumos, produção, estoque, vendas e resultados.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f5f7fb",
    theme_color: "#ffffff",
    lang: "pt-BR",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Pedidos", url: "/pedidos" },
      { name: "Calculadora", url: "/calculadora" },
      { name: "Inventário", url: "/inventario" },
    ],
  };
}
