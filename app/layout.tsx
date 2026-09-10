import type {Metadata} from "next";import "./globals.css";import {Toaster} from "@/components/ui/sonner";
export const metadata:Metadata={title:"Calculadora Summon",description:"Gestão online para sua loja de impressão 3D."};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="pt-BR"><body>{children}<Toaster richColors/></body></html>}
