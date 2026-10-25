# Gestão de produção 3D

Sistema para quem vende peças impressas em 3D: calcula custo e preço, controla filamento e peças prontas, organiza pedidos e produção e mostra o financeiro do mês.

## O que o sistema faz

- **Calculadora:** custo por peça (filamento, componentes, energia, desgaste da impressora, mão de obra, manutenção, falhas e embalagem) e preço sugerido para venda direta, Shopee e Mercado Livre, com lucro e margem já descontados imposto e taxas. Peso e tempo podem ser lidos do G-code ou do 3MF fatiado (PrusaSlicer, OrcaSlicer, Bambu Studio, Cura).
- **Catálogo e ficha técnica:** cada produto guarda materiais, pesos e tempos em versões. Quando o filamento ou os parâmetros mudam, o sistema avisa quais preços ficaram desatualizados.
- **Insumos:** estoque de filamento em gramas e de outros insumos (ímãs, parafusos, caixas, etiquetas) com custo médio. Compras à vista, a prazo ou parceladas. Lista de reabastecimento por fornecedor, com texto pronto para pedir cotação.
- **Produção:** kanban de ordens. Ao concluir, baixa o filamento e os componentes e cria um lote de peças com o custo real.
- **Vendas:** pedidos do orçamento à entrega, com separação de estoque por lote (o mais antigo primeiro), devolução e clientes. Orçamento para o cliente em texto (WhatsApp), impressão ou link público revogável.
- **Financeiro:** contas a pagar (com recorrência e parcelas), contas a receber (com recebimento parcial e repasse de marketplace), extrato de caixa e resultado do mês (DRE).
- **Painel e relatórios:** resumo do dia (contas, recebimentos, estoque mínimo, pedidos parados, orçamentos), vendas, lucro, metas do mês, curva ABC e planilhas do mês para o contador.
- **Inventário:** contagem física de filamento, insumos e peças prontas, com as diferenças em reais, aplicada de uma vez.
- **No celular:** pode ser instalado na tela inicial e abre como aplicativo.

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
   - `BACKUP_SECRET`: opcional, para a cópia semanal automática (veja "Backup").
3. Faça o deploy. As tabelas e os índices são criados sozinhos no primeiro acesso.
4. Entre no sistema e confira que o topo mostra **Banco permanente**.
5. Em **Configurações → Parâmetros**, informe o saldo inicial do caixa, revise taxas, imposto e prazos de repasse, e preencha os dados da empresa que aparecem no orçamento.

Se você já usava o sistema só no navegador, o primeiro acesso com o banco vazio transfere esses dados para o banco automaticamente.

## Resumo do dia por e-mail (opcional)

O resumo aparece no painel sempre. Para recebê-lo também por e-mail, toda manhã entre 7h e 8h:

1. Crie uma conta gratuita no [Resend](https://resend.com) e gere uma chave de API.
2. Na Vercel, cadastre `RESEND_API_KEY` (a chave), `RESUMO_EMAIL_PARA` (o e-mail da sua conta do Resend) e `CRON_SECRET` (um texto aleatório de pelo menos 16 caracteres), e faça um novo deploy.

Sem domínio próprio verificado no Resend, o envio só chega ao e-mail da sua conta do Resend, o que basta para você receber o próprio resumo. Para mandar para outros endereços, verifique um domínio no Resend e cadastre `RESUMO_EMAIL_DE` (ex.: `Oficina 3D <resumo@seudominio.com.br>`). O agendamento está em `vercel.json`; o e-mail só sai quando há algo pedindo atenção.

## Instalar no celular

- **iPhone (Safari):** botão Compartilhar → Adicionar à Tela de Início.
- **Android (Chrome):** menu ⋮ → Instalar app (ou Adicionar à tela inicial).

O sistema abre em tela cheia, com ícone próprio e atalhos para Pedidos, Calculadora e Inventário. Ele continua precisando de internet: os dados ficam no banco, não no aparelho.

## Fotos dos produtos

As fotos ficam numa tabela própria no Turso, e o produto guarda só o endereço (`/api/imagens/...`). Assim cada gravação dos dados continua pequena: a Vercel recusa envios acima de 4,5 MB, e com as fotos embutidas esse limite chegaria com algumas dezenas de produtos. Fotos cadastradas antes dessa mudança são separadas sozinhas na primeira abertura do sistema.

O endereço de uma foto abre sem senha, porque ela também aparece no orçamento público. Ele é aleatório (128 bits), então só quem recebeu o link consegue abrir.

## Backup

- **Na hora:** Configurações → Exportar backup. O arquivo leva os dados e as fotos, e pode ser importado em Configurações → Importar backup.
- **Automático, toda segunda às 6h:** o GitHub baixa o backup e guarda por 90 dias, na aba **Actions → Backup semanal** (cada execução tem o arquivo para baixar em "Artifacts"). Para ligar:
  1. Gere um texto aleatório com pelo menos 24 caracteres (por exemplo, `openssl rand -hex 24`).
  2. Na Vercel, cadastre esse texto como `BACKUP_SECRET` e faça um novo deploy.
  3. No GitHub, em **Settings → Secrets and variables → Actions**, crie `BACKUP_SECRET` com o mesmo texto e `APP_URL` com o endereço de produção (ex.: `https://gestao3d.vercel.app`).
  4. Em **Actions → Backup semanal → Run workflow**, rode uma vez para conferir.

  A cópia automática só roda em repositório **privado**: num repositório público, qualquer pessoa conseguiria baixar o arquivo. Ela também apaga fotos que nenhum produto usa há mais de 30 dias.

## Testes e conferência

```sh
pnpm test        # regras de custo, estoque, produção, vendas, financeiro, login e conferência do servidor
pnpm typecheck   # confere os tipos de todo o projeto
```

O build da Vercel não para por erro de tipo (`typescript.ignoreBuildErrors` em `next.config.ts`), para que um detalhe de tipagem não derrube uma publicação. Em compensação, o GitHub roda `pnpm typecheck` e `pnpm test` a cada envio (`.github/workflows/verificacao.yml`): um ✗ vermelho ao lado do commit mostra que algo quebrou, antes de você precisar descobrir pelo sistema.

## Como o código está organizado

| Pasta | O que tem |
| --- | --- |
| `lib/summon.ts` | Tipos e regras centrais: custo, preço, produção, venda, devolução |
| `lib/finance.ts` | Contas a pagar e a receber, extrato de caixa, DRE |
| `lib/operations.ts` | Criar pedido e registrar compra de filamento |
| `lib/integrity.ts` | Conferência que o servidor faz antes de gravar |
| `lib/dashboard.ts` | Números do painel |
| `lib/restock.ts` | Lista de reabastecimento |
| `lib/slicer.ts` | Leitura de G-code e 3MF fatiado |
| `lib/quote.ts` | Orçamento para o cliente |
| `lib/daily.ts` | Resumo do dia (painel e e-mail) |
| `lib/inventory.ts` | Inventário: diferenças e correção do estoque |
| `lib/export.ts` | Planilhas para o contador (CSV para Excel) |
| `lib/images.ts` | Fotos dos produtos: validação, separação dos dados e volta para o backup |
| `components/summon-app.tsx` | Estrutura do app: menu, carregamento e gravação dos dados |
| `components/app/*.tsx` | Uma pasta por área: `dashboard`, `sales`, `products`, `production`, `supplies`, `finance`, `reports`, `settings` e `shared` (campos, tabelas e cartões comuns) |
| `app/api/state` | API que lê e grava os dados no Turso |
| `app/api/imagens` | Envio e entrega das fotos dos produtos |
| `app/api/resumo` | E-mail da manhã, chamado pelo agendamento da Vercel |
| `app/api/backup` | Backup completo, para o botão de exportar e para a cópia semanal |
| `app/entrar`, `app/api/sessao` | Login por senha |
| `app/o/[token]` | Página pública do orçamento (sem senha, só com o link; some quando o link é desativado) |
| `db/` | Acesso ao Turso, tabelas e índices |

Os dados ficam em tabelas por tipo (materiais, pedidos, lotes etc.). Cada gravação usa controle de versão, para que duas pessoas mexendo ao mesmo tempo não sobrescrevam uma à outra, e fica registrada na auditoria.

## Limpeza de dependências pendente

O projeto deixou de usar Cloudflare, Drizzle e vários componentes visuais, mas os pacotes continuam no `package.json` para não desalinhar o `pnpm-lock.yaml`. Para removê-los, rode no seu computador e faça commit dos dois arquivos:

```sh
pnpm remove @base-ui/react @hookform/resolvers @shadcn/react cmdk date-fns drizzle-orm embla-carousel-react input-otp react-day-picker react-hook-form react-resizable-panels vaul zod @cloudflare/vite-plugin @cloudflare/workers-types @vitejs/plugin-react @vitejs/plugin-rsc drizzle-kit react-server-dom-webpack vinext vite wrangler
```

Depois disso, a linha `workerd: true` em `pnpm-workspace.yaml` também pode sair.
