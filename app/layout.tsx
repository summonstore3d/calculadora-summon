import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Gestão de produção 3D",
  description: "Custos, insumos, produção, estoque, vendas e resultados.",
  applicationName: "Gestão 3D",
  // No iPhone, "Adicionar à Tela de Início" usa estes dados; no Android, o manifest (app/manifest.ts).
  appleWebApp: { capable: true, title: "Gestão 3D", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        {children}
        <Toaster richColors />
      </body>
    </html>
  );
}
