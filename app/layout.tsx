import type {Metadata} from "next";import "./globals.css";import {Toaster} from "@/components/ui/sonner";
export const metadata:Metadata={title:"Gestão de produção 3D",description:"Custos, insumos, produção, estoque, vendas e resultados."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}<Toaster richColors/></body></html>}
