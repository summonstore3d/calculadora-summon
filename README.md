# Gestão de produção 3D

Sistema para quem vende peças impressas em 3D: calcula custo e preço, controla filamento e peças prontas, organiza pedidos e produção e mostra o financeiro do mês.

## O que o sistema faz

- **Calculadora:** custo por peça (filamento, energia, desgaste da impressora, mão de obra, manutenção, falhas e embalagem) e preço sugerido para venda direta, Shopee e Mercado Livre, com lucro e margem já descontados imposto e taxas.
- **Catálogo e ficha técnica:** cada produto guarda materiais, pesos e tempos em versões. Quando o filamento ou os parâmetros mudam, o sistema avisa quais preços ficaram desatualizados.
- **Insumos:** estoque de filamento em gramas com custo médio. Compras à vista, a prazo ou parceladas.
- **Produção:** kanban de ordens. Ao concluir, baixa o filamento e cria um lote de peças com o custo real.
- **Vendas:** pedidos do orçamento à entrega, com separação de estoque por lote (o mais antigo primeiro), devolução e clientes.
- **Financeiro:** contas a pagar (com recorrência e parcelas), contas a receber (com recebimento parcial e repasse de marketplace), extrato de caixa e resultado do mês (DRE).
- **Painel e relatórios:** vendas, lucro, metas do mês, curva ABC, cobertura de estoque e necessidade de compra.

## Rodar no computador

Requer Node.js 22.13 ou mais novo e pnpm.

```sh
pnpm install
cp .env.example .env.local   # e preencha APP_PASSWORD
pnpm dev
```

Abra http://localhost:3000 e entre com a senha definida em `APP_PASSWORD`. Sem as variáveis do Turso, os dados ficam salvos só no navegador, e o topo da tela mostra "Somente neste navegador".

## Publicar na Vercel

1. Crie um banco no [Turso](https://turso.tech) e copie a URL (`libsql://...`) e um token de acesso.
2. Na Vercel, em **Settings → Environment Variables**, cadastre para Production e Preview:
   - `APP_PASSWORD`: a senha de acesso ao sistema (obrigatória; sem ela ninguém entra).
   - `APP_SESSION_SECRET`: opcional, um texto longo e aleatório. Sem ele, a própria senha assina a sessão, e trocar a senha desconecta todo mundo.
   - `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`: o banco onde os dados ficam guardados.
3. Faça o deploy. As tabelas e os índices são criados sozinhos no primeiro acesso.
4. Entre no sistema e confira que o topo mostra **Banco permanente**.
5. Em **Configurações → Parâmetros**, informe o saldo inicial do caixa e revise taxas, imposto e prazos de repasse.

Se você já usava o sistema só no navegador, o primeiro acesso com o banco vazio transfere esses dados para o banco automaticamente.

## Testes e conferência

```sh
pnpm test        # regras de custo, estoque, produção, vendas, financeiro, login e conferência do servidor
pnpm typecheck   # confere os tipos de todo o projeto
```

O build da Vercel não para por erro de tipo (`typescript.ignoreBuildErrors` em `next.config.ts`), para que um detalhe de tipagem não derrube uma publicação. Rode `pnpm typecheck` antes de publicar mudanças no código.

## Como o código está organizado

| Pasta | O que tem |
| --- | --- |
| `lib/summon.ts` | Tipos e regras centrais: custo, preço, produção, venda, devolução |
| `lib/finance.ts` | Contas a pagar e a receber, extrato de caixa, DRE |
| `lib/operations.ts` | Criar pedido e registrar compra de filamento |
| `lib/integrity.ts` | Conferência que o servidor faz antes de gravar |
| `lib/dashboard.ts` | Números do painel |
| `components/summon-app.tsx` | Estrutura do app: menu, carregamento e gravação dos dados |
| `components/app/*.tsx` | Uma pasta por área: `dashboard`, `sales`, `products`, `production`, `supplies`, `finance`, `reports`, `settings` e `shared` (campos, tabelas e cartões comuns) |
| `app/api/state` | API que lê e grava os dados no Turso |
| `app/entrar`, `app/api/sessao` | Login por senha |
| `db/` | Acesso ao Turso, tabelas e índices |

Os dados ficam em tabelas por tipo (materiais, pedidos, lotes etc.). Cada gravação usa controle de versão, para que duas pessoas mexendo ao mesmo tempo não sobrescrevam uma à outra, e fica registrada na auditoria.

## Limpeza de dependências pendente

O projeto deixou de usar Cloudflare, Drizzle e vários componentes visuais, mas os pacotes continuam no `package.json` para não desalinhar o `pnpm-lock.yaml`. Para removê-los, rode no seu computador e faça commit dos dois arquivos:

```sh
pnpm remove @base-ui/react @hookform/resolvers @shadcn/react cmdk date-fns drizzle-orm embla-carousel-react input-otp react-day-picker react-hook-form react-resizable-panels vaul zod @cloudflare/vite-plugin @cloudflare/workers-types @vitejs/plugin-react @vitejs/plugin-rsc drizzle-kit react-server-dom-webpack vinext vite wrangler
```

Depois disso, a linha `workerd: true` em `pnpm-workspace.yaml` também pode sair.
