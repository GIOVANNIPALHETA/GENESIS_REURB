# Correções de segurança, painel e documentos

## Alterações

- Downloads em `/uploads/documents/:fileName` exigem usuário ativo e arquivo registrado. Os links das telas baixam o arquivo com autenticação e conservam o nome original. Arquivos são entregues como anexos, sem cache público.
- Usuários inativos ou excluídos deixam de acessar a API. O perfil atual é consultado no banco, evitando privilégios antigos no token. Sessões novas incluem a versão do usuário e são encerradas quando seu cadastro muda. Tokens anteriores continuam compatíveis, mas também verificam usuário ativo e perfil atual.
- O login simulado foi removido. JWT_SECRET precisa estar configurado; o valor público alternativo não é mais utilizado.
- CONSULTA não pode alterar os cadastros revisados. Alterações financeiras exigem ADMIN, GESTOR ou FINANCEIRO. Upload de documentos admite ADMIN, GESTOR, DOCUMENTAL, JURIDICO e ATENDENTE; aprovação exige ADMIN, GESTOR, DOCUMENTAL ou JURIDICO; exclusão e sincronização exigem ADMIN, GESTOR ou DOCUMENTAL. Leituras autenticadas mantêm o acesso anterior; não foi criado isolamento por projeto ou cliente.
- O webhook exige ASAAS_WEBHOOK_TOKEN e verifica o cabeçalho `asaas-access-token`. Sem configuração retorna 503, sem token válido retorna 401. A importação por planilha permanece disponível aos perfis financeiros autorizados.
- O painel usa pagamentos, parcelas, documentos e cadastros reais, incluindo os últimos seis meses, saldos parciais e atividades dos últimos sete dias. O saldo a receber corresponde às parcelas abertas cadastradas, não ao total contratado menos recebimentos.
- Dossiês só contam documentos aprovados e dentro da validade. “Enviado” e “validado” são situações distintas. O documento do cônjuge não preenche o item do titular. As telas de documentos e de detalhe do lote permitem revisar a situação, respeitando os perfis.
- A busca por nome deixa de incluir um filtro de CPF vazio, que poderia retornar resultados indevidos.
- O seed deixa de redefinir a senha de um administrador existente. Para criar o primeiro administrador é necessário ADMIN_INITIAL_PASSWORD com pelo menos 12 caracteres. O seed não foi executado.
- Testes de regressão estão disponíveis com `npm test` na raiz ou no backend. O workflow do GitHub verifica testes e builds após o código ser enviado ao repositório.

## Verificação local

Foram executados o build do backend, a checagem TypeScript da interface, a geração de produção pelo Vite e 12 testes automatizados. Também foram verificadas, apenas com leitura no banco local, as rotas do painel, dos dossiês, dos projetos e o download autenticado de um documento existente.

O comando padrão de build do frontend encontrou uma restrição de acesso do ambiente do agente ao carregar a configuração. A geração foi concluída carregando exatamente a mesma configuração diretamente pelo Node 24:

```powershell
cd frontend
node --input-type=module -e "import { build } from 'vite'; import config from './vite.config.ts'; await build({ ...config, configFile: false });"
```

Permanece o aviso de tamanho do pacote JavaScript. A navegação completa em um navegador e eventos reais de pagamento não foram testados. O workflow ainda não foi executado no GitHub.

## Configuração pendente

ASAAS_WEBHOOK_TOKEN não estava configurado no ambiente local. É necessário definir no ambiente do servidor o mesmo token de autenticação configurado no webhook do Asaas. Não usar a chave de API como token de webhook. Referência: https://docs.asaas.com/docs/webhooks-3

## Próximas etapas separadas

Não houve migração do banco, importação, alteração de registros reais, mudança de senha existente, publicação ou envio ao GitHub. A conversão dos valores monetários de Float para Decimal, a revisão de idempotência e concorrência de pagamentos, a fila de tarefas, as etapas do processo por lote e a divisão das telas grandes permanecem para etapas próprias, com validação específica. Os totais novos do painel somam centavos inteiros em memória; isso não substitui a migração monetária do banco.

As alterações ficaram na cópia de trabalho local, sem commit. A criação de uma ramificação foi impedida pelo ambiente. Antes das edições foi salvo um ZIP dos arquivos versionados do HEAD original; esse ZIP não inclui banco, uploads nem arquivos .env.
