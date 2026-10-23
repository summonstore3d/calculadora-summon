# Mudanças

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
