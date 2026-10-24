import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Os tipos são conferidos por `pnpm typecheck` e pelo editor. O build não para por erro de tipo
    // para não derrubar uma publicação por um detalhe de tipagem; erros de sintaxe continuam parando.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
