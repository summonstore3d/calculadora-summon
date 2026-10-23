# Mudanças

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
