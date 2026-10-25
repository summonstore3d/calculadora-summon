# Mudanças

## Fase 7 · Rotina mais leve (24/10/2026)

**Resumo do dia** (painel)
- Substitui "Pendências de hoje": uma lista em ordem de urgência com contas atrasadas, de hoje e dos próximos 3 dias; recebimentos atrasados; filamento e insumos abaixo do mínimo; peças prontas abaixo do mínimo; pedidos parados há mais de 5 dias (enviados, 10); produção atrasada ou sem filamento; máquinas pedindo manutenção; orçamentos vencendo ou vencidos.
- Cada linha mostra o total em reais quando faz sentido e abre a tela ou o pedido certo.
- Opcional: o mesmo resumo por e-mail toda manhã (Resend + agendamento da Vercel), só quando há algo pedindo atenção.

**Inventário** (Insumos → Inventário)
- Contagem de filamento (em gramas), outros insumos e peças prontas, com busca, filtros e o botão ✓ para "confere com o sistema".
- Mostra a diferença de cada item e o total de faltas e sobras em reais. A contagem fica salva no navegador até ser aplicada.
- Ao aplicar: falta de peça sai dos lotes mais antigos; sobra vira um lote de ajuste (AJ-...) ao custo médio atual. Toda correção fica nas movimentações com o motivo.
- "Baixar folha de contagem" gera a lista para contar no papel ou na planilha.

**Planilhas para o contador** (Gestão → Relatórios)
- Vendas (uma linha por item), resultado do mês (DRE), contas a pagar, extrato do caixa e estoque valorizado, em CSV que o Excel em português abre direto.
- Texto que começa com =, +, - ou @ é protegido para o Excel não executar como fórmula.

**Instalar no celular**
- Manifest, ícones e metadados para "Adicionar à tela inicial" no Android e no iPhone, com atalhos para Pedidos, Calculadora e Inventário.

## Fase 6 · Proteger o que já existe (24/10/2026)

**Fotos fora dos dados principais**
- As fotos dos produtos passam a ficar numa tabela própria no Turso (`images`); o produto guarda só o endereço `/api/imagens/...`. Antes, cada foto (50 a 150 KB) ia junto em toda gravação, e a Vercel recusa envios acima de 4,5 MB.
- Fotos já cadastradas são separadas sozinhas na primeira abertura depois da atualização.
- O servidor confere pelos bytes que o arquivo é mesmo JPG, PNG ou WebP (até 2 MB depois de reduzido).
- No modo "Somente neste navegador", nada muda: a foto continua embutida.
- Editar produto agora mostra a foto atual e permite removê-la.

**Fotos no orçamento e no pedido**
- O orçamento (texto impresso, PDF e link público) mostra a foto de cada item ao lado do nome.
- O detalhe do pedido mostra a miniatura de cada produto.
- No catálogo, a foto virou uma miniatura ao lado do nome, com as iniciais do produto quando não há foto.

**Backup**
- "Exportar backup" agora leva as fotos dentro do arquivo. "Importar backup" envia as fotos uma a uma antes de gravar os dados, para não passar do limite.
- Cópia automática toda segunda às 6h pelo GitHub (`.github/workflows/backup.yml`), guardada por 90 dias. Precisa de `BACKUP_SECRET` na Vercel e no GitHub; só roda em repositório privado. Também apaga fotos sem uso há mais de 30 dias.

**Verificação automática**
- `.github/workflows/verificacao.yml` roda `pnpm typecheck` e `pnpm test` a cada envio ao GitHub.
- O limite de gravação do servidor passou de 8 MB para 4,4 MB, abaixo do limite da Vercel, para a mensagem de erro ser clara.

## Fase 5 · Operação do dia a dia (24/10/2026)

**Outros insumos** (Insumos → Outros insumos)
- Cadastro de ímãs, parafusos, caixas, etiquetas e qualquer item comprado pronto, com unidade, estoque mínimo, fornecedor e local.
- Entrada com custo médio (4 casas, para itens de centavos) e pagamento à vista, a prazo ou parcelado, como no filamento.
- Ajuste de estoque por contagem, com motivo.
- Na ficha técnica e na calculadora, "Componentes por peça" entra no custo e no preço. A reserva de falha não incide sobre eles.
- Ao concluir a produção, os componentes das peças aprovadas saem do estoque (peças perdidas não recebem componente). Falta de componente impede concluir, como a falta de filamento.
- O aviso de preço desatualizado também considera mudanças no custo dos componentes.

**Reabastecimento** (Insumos → Reabastecimento)
- Lista do que comprar: estoque mínimo + o que as ordens de produção abertas vão usar + consumo médio dos últimos 30 dias pelos dias de cobertura escolhidos (7 a 60) − estoque atual.
- Agrupada por fornecedor, com urgência (falta para a produção, abaixo do mínimo, acaba em X dias), preço da última compra e custo estimado.
- Quantidades editáveis, "Copiar lista" com texto pronto para o fornecedor e "Registrar compra" já preenchido.

**Leitura do arquivo do fatiador** (calculadora e ficha técnica)
- G-code de texto do PrusaSlicer, SuperSlicer, OrcaSlicer, Bambu Studio, Cura e Simplify3D; 3MF fatiado do Bambu Studio e OrcaSlicer, com escolha do prato.
- Mostra o que encontrou (peso, tempo, filamentos) e só preenche ao clicar em Aplicar. Em várias cores, cria uma linha por filamento.
- Arquivos grandes são lidos só no começo e no fim. G-code binário e 3MF sem fatiar recebem uma explicação de como exportar.

**Orçamento para o cliente** (pedido → Orçamento para o cliente)
- Dados da empresa, condições e validade em Parâmetros.
- Pré-visualização com itens, descontos, frete, total, prazo de produção e validade, sem custo, margem ou lucro.
- Copiar texto para WhatsApp, imprimir ou salvar em PDF, e link público (`/o/...`) que o cliente abre no celular sem senha; o link pode ser desativado a qualquer momento.

**Banco**
- Nova tabela `supplies` e índice; criadas sozinhas no primeiro acesso. A conferência do servidor passa a recusar estoque de insumo negativo.

**Testes**
- 17 testes novos (insumos, reabastecimento, fatiador, orçamento). Total: 71 testes de regra, mais o de persistência. Roteiro no navegador ampliado para 17 operações, todas passando.

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
