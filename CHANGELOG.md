# Mudanças

## Fase 4 · Organizar o código (24/10/2026)

Nada muda no uso do sistema, exceto os três ajustes visuais no fim desta lista. O objetivo é deixar as próximas mudanças mais seguras.

**Só Vercel**
- Removido tudo do Cloudflare (vinext, Wrangler, D1, R2, migrações Drizzle, plugin do ChatGPT Sites). `pnpm dev`, `pnpm build` e `pnpm start` agora são os comandos padrão do Next.js.
- Login por senha em qualquer ambiente, inclusive no computador (`.env.local`). Os dados continuam ligados ao mesmo dono.
- Fotos de produto são reduzidas no navegador (lado maior 900 px, WebP) antes de salvar: uma foto de celular de 3 MB vira cerca de 60 KB.
- Conexão com o Turso tenta de novo depois de uma falha, em vez de ficar presa no erro até o servidor reiniciar.

**Servidor mais rigoroso**
- Antes de gravar, a API confere se a gravação criou alguma incoerência nova: estoque do produto diferente da soma dos lotes, lote com saldo inválido, filamento negativo, recebimento que não bate com as parcelas, conta sem valor, pedido, SKU ou OP repetidos. Dados antigos já incoerentes não bloqueiam o uso.
- Limite de 8 MB por gravação, com mensagem clara.
- Índices por usuário em 14 tabelas que eram lidas por inteiro.

**Código**
- A interface, que era um arquivo de 180 KB, foi dividida por área em `components/app/` (painel, vendas, produtos, produção, insumos, financeiro, relatórios, parâmetros e componentes comuns), formatada e sem `@ts-nocheck`.
- Criar pedido e registrar compra viraram funções testadas em `lib/operations.ts`.
- Removidos o painel antigo (sem uso) e 54 componentes visuais sem uso.
- Novos scripts: `pnpm typecheck`. README reescrito.

**Correções encontradas no caminho**
- Desconto por item era ignorado ao criar o pedido: o valor a receber e o imposto saíam maiores até a conclusão da venda.
- O painel de produto, feito para abrir como gaveta à direita, abria deslocado e cortado no topo (o Tailwind 4 desloca com `translate`, que a regra antiga não anulava).
- Situações aparecem em português e com acento (Orçamento, Concluído, Ativo, Em manutenção) em vez de "Orcamento" ou "Active".

**Testes**
- 7 testes novos (pedido, compra e conferência do servidor). Total: 54 testes de regra, mais o de persistência, que exige as dependências instaladas.
- Roteiro no navegador com 12 operações (calculadora, ficha técnica, pedido do orçamento à venda, produção, compra parcelada, financeiro, parâmetros, todas as telas e celular) com resultado idêntico antes e depois da reorganização.

## Fase 3 · Completar o financeiro (23/10/2026)

**Tela do Financeiro, refeita**
- Seletor de mês e quatro abas: Visão geral, A pagar, A receber e Extrato.
- Visão geral: entradas, saídas, saldo do mês e caixa acumulado, lucro líquido, totais a receber e a pagar com vencidos, e a previsão dos próximos 30 dias.
- Resultado do mês (DRE) comparado ao mês anterior: receita, descontos, taxas, impostos, custo das peças vendidas, frete, anúncios, margem de contribuição, despesas por categoria e lucro líquido. Exporta em CSV.
- Extrato do caixa com saldo inicial, cada entrada e saída e o saldo linha a linha. Exporta em CSV.
- Saldo inicial do caixa configurável em Parâmetros.

**Contas a pagar**
- Nova conta com categoria, vencimento, parcelas, "repete todo mês" e "já está paga".
- Editar e cancelar contas (antes não era possível).
- Pagar com data e valor; conta recorrente gera automaticamente a do mês seguinte.
- Situação visível: vencida, vence hoje, vence esta semana, paga, cancelada.

**Compras e manutenções**
- Ao registrar uma compra de filamento: à vista (sai do caixa na data), a prazo ou parcelado (vira contas a pagar).
- Estornar uma compra cancela as parcelas ainda em aberto.
- Registrar manutenção com custo lança a saída no caixa.
- Compras e manutenções antigas, sem conta vinculada, entram no extrato pela data em que foram registradas.

**Contas a receber**
- Recebimento parcial (sinal e restante), com histórico de cada recebimento.
- Pedidos da Shopee e do Mercado Livre entram pelo valor do repasse, sem as taxas, com previsão de pagamento configurável em Parâmetros (padrão 15 dias).

**Lucro igual em todas as telas**
- Painel, Relatórios e Financeiro usam a mesma regra: despesas pela data de vencimento, sem compras de filamento, manutenção e a categoria Impostos (que já estão no custo das peças ou no imposto de cada pedido). No painel, o card passou a se chamar "Lucro líquido".

**Painel e relatórios**
- Metas do mês (cadastradas em Parâmetros) aparecem no painel com o realizado, a porcentagem e um marcador de onde deveriam estar no dia de hoje.
- CSV de relatórios abre certo no Excel em português: acentos, ponto e vírgula e vírgula decimal.

**Testes**
- 11 testes novos de financeiro. Total: 47 testes de regra passando, mais o de persistência, que exige as dependências instaladas.

## Fase 2 · Acertar os números (23/10/2026)

**Calculadora**
- Lucro e margem agora descontam o imposto e as taxas de cada canal. Cada canal (direto, Shopee, Mercado Livre) mostra preço, taxas, imposto, lucro e margem reais.
- O controle de margem passou a se chamar "Lucro sobre o custo (markup)", que é o que ele sempre calculou: quanto sobra acima do custo depois de imposto e taxas.
- Escolha da impressora: potência, valor e vida útil da máquina cadastrada entram no custo de energia e depreciação.
- Mão de obra separada em "Preparo por impressão (h)" e "Acabamento por peça (min)". Num lote de 10 peças, o acabamento agora é contado 10 vezes.
- A reserva de falha vale só para o que se perde ao reimprimir (material, energia, máquina, manutenção e preparo). Acabamento, embalagem e outros custos ficam fora.
- O peso do slicer já inclui suportes e purga; a "perda extra" padrão caiu de 8% para 3% e o texto explica o que entra nela.

**Catálogo e ficha técnica**
- Botão "Editar ficha" no produto: altera materiais, pesos, tempos, impressora, perdas e markup, mostra o antes e depois de custo, preços e lucro, e grava uma nova versão. Lotes e vendas antigos mantêm o custo da época.
- Aviso de preço desatualizado quando o custo médio do filamento ou os Parâmetros mudam mais de 1%, no topo do catálogo e no produto, com atualização individual ou em lote.
- Margem exibida no catálogo passou a ser a líquida de imposto, inclusive para produtos cadastrados antes.

**Produção**
- Ao concluir uma ordem, o tempo de impressão e a mão de obra vêm preenchidos para a ordem inteira (antes vinham com o valor de uma única impressão).
- O custo do lote deixou de contar a embalagem duas vezes, e os outros custos por impressão passaram a ser multiplicados pelo número de impressões.

**Testes**
- 7 testes novos de custo, canal, impressora, produção e ficha técnica. Total: 37 testes de regra passando, mais o de persistência, que exige as dependências instaladas.

## Fase 1 · Proteger os dados (23/10/2026)

**Acesso**
- Na Vercel, o acesso deixa de ser automático: o sistema pede a senha definida em `APP_PASSWORD` (tela `/entrar`, sessão assinada de 30 dias, botão Sair funcionando). Sem a variável, ninguém entra.

**Backup**
- Importar backup agora mostra uma comparação (registros atuais × arquivo), avisa quando o arquivo está vazio e só substitui após confirmação. O diálogo oferece exportar o backup atual antes.
- Arquivos que não são backup deste sistema são recusados em vez de zerar os dados.
- O servidor recusa importação sem confirmação e guarda o estado anterior na auditoria (até ~900 KB; acima disso, guarda as contagens).
- O backup exportado leva a data no nome.

**Carga e gravação**
- Se os dados salvos no navegador estiverem ilegíveis, o sistema não abre vazio nem grava por cima: mostra o erro e permite baixar o conteúdo.
- Conflito entre duas sessões é detectado pelo campo `conflict` da API, não mais pelo texto da mensagem.

**Datas**
- O dia e o mês do negócio seguem o horário de Brasília. Vendas, despesas e recebimentos após 21h deixam de cair no dia (ou mês) seguinte no Financeiro, nos Relatórios e nos filtros de pedidos.
- Vencimentos sem hora deixam de recuar um dia no painel.

**Códigos e preços**
- SKU, pedido (PV), ordem de produção (OP) e lote seguem o maior número já usado, sem repetir após exclusões.
- Criar produto com SKU já existente mostra um aviso em vez de erro do banco.
- No pedido, o preço sugerido acompanha o canal (direto, Shopee, Mercado Livre). Preços digitados à mão são mantidos ao trocar o canal.

**Testes**
- Novo script `npm test`; 14 testes novos (login, auditoria, datas, códigos, preço por canal). Total: 30 testes de regra, todos passando, mais o teste de persistência que exige as dependências instaladas.
