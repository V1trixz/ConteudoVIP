# Pesquisa de Integração

## EvoPay PIX

A documentação oficial da EvoPay apresenta a base `https://pix.evopay.cash` e a criação de cobrança pelo endpoint `POST /v1/pix`, autenticado por meio do cabeçalho `API-Key`. A solicitação aceita `amount`, `callbackUrl`, dados opcionais do pagador e `externalReference`. A resposta inclui identificador da transação, estado, valor, texto do QR Code Pix, imagem em base64 e URL do QR Code.

O sistema deverá usar uma referência externa única por pagamento, persistir o identificador retornado pela EvoPay e tratar os estados `PENDING`, `COMPLETED`, `CANCELED`, `WAITING_FOR_REFUND`, `REFUNDED` e `EXPIRED`. A confirmação pelo callback deverá ser idempotente: uma repetição da mesma notificação não poderá renovar a assinatura ou gerar mais de um convite.

> Fonte consultada: https://docs.evopay.cash/pt/reference/pix/post-v1-pix

## Callback da EvoPay

A EvoPay envia um `POST` para a `callbackUrl` configurada na transação sempre que o status é atualizado. O receptor deve responder com qualquer código `2xx` para confirmar o recebimento. A política informada prevê até cinco tentativas, atraso exponencial com base de dois minutos e variação aleatória, e dez segundos de tempo máximo por tentativa. O payload traz, entre outros dados, `id`, `type`, `status`, `amount`, `clientReference`, `endToEndId`, `paidAt`, `createdAt` e `updatedAt`.

Como a referência pesquisada não apresenta uma assinatura criptográfica do callback, a implementação validará a transação no servidor pela API autenticada da EvoPay antes de conceder acesso. O endpoint também comparará ID da transação, referência externa, valor, tipo `DEPOSIT` e estado `COMPLETED` com o pagamento pendente persistido.

A consulta independente será feita por `GET /v1/pix?id=<id-da-transacao>` usando o mesmo cabeçalho `API-Key`. A API retorna ao menos `id`, `status`, `amount`, `type` e os dados de QR Code, permitindo comparar o pagamento persistido antes de ativar a assinatura.

> Fonte consultada: https://docs.partners.evopay.cash/en/guide/webhook

## Telegram Bot API

A API oficial do Telegram disponibiliza `createChatInviteLink` com data de expiração e limite de membros, portanto o convite será emitido com uso máximo de uma pessoa e validade curta. A remoção de acesso será feita por `banChatMember`; uma reativação posterior chamará `unbanChatMember` antes da emissão de novo convite. O bot receberá comandos e interações por webhook configurado pelo método `setWebhook`, protegido por um token secreto próprio do Telegram.

O parâmetro `secret_token` de `setWebhook` deve ser usado com uma credencial aleatória entre 1 e 256 caracteres. O Telegram inclui esse valor no cabeçalho `X-Telegram-Bot-Api-Secret-Token` de cada atualização; o endpoint do bot rejeitará chamadas cujo valor não coincida com o segredo armazenado no servidor.

> Fonte consultada: https://core.telegram.org/bots/api
