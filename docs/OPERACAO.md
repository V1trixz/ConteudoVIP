# Guia operacional e resposta a incidentes

## Critérios de liberação de acesso

| Verificação | Obrigatória | Consequência se falhar |
|---|---:|---|
| Confirmação +18 | Sim | O usuário não vê os planos nem pode gerar um PIX. |
| Plano ativo | Sim | A compra é bloqueada. |
| PIX com `DEPOSIT` e `COMPLETED` | Sim | O acesso não é liberado. |
| Identificador e referência correspondentes | Sim | O callback é rejeitado. |
| Valor em centavos correspondente | Sim | O callback é rejeitado. |
| Link de convite único | Sim | O sistema não emite um convite compartilhável. |

## Falhas comuns

| Sintoma | Verificação recomendada | Ação segura |
|---|---|---|
| PIX pago, mas sem convite | Veja **Pagamentos** e **Log operacional**; valide a transação na EvoPay. | Use **Assinantes → Reenviar** somente depois de confirmar que a assinatura está ativa. |
| Usuário não consegue entrar | Confirme que o bot possui permissão de convite e que o grupo configurado é o correto. | Gere um novo convite; o anterior será revogado. |
| Usuário removido apesar de renovação | Verifique as assinaturas e a data de expiração no painel. | Evite editar o banco manualmente; corrija o estado pelo fluxo de renovação. |
| Lembretes não são enviados | Confira se a automação está ativa e a última execução registrada. | Reative a tarefa em **Operação** após confirmar que o projeto está publicado. |
| Telegram não responde ao `/start` | Confira o segredo do webhook e os logs. | Reconfigure o webhook pelo painel depois de confirmar a URL pública. |

## Apresentação do bot e cobrança PIX

A tela **Operação → Apresentação do /start** permite alterar o título, a descrição, o aviso de maioridade, a prévia textual e uma URL pública opcional para a imagem de prévia. A imagem deve ser hospedada em um endereço HTTPS acessível publicamente, pois o Telegram a buscará diretamente ao enviar a mensagem.

Quando a EvoPay informar a expiração da cobrança, o sistema a persiste em **Pagamentos → Validade PIX** e a apresenta ao assinante na mensagem de cobrança. Caso o provedor não retorne esse dado, o painel mostrará **Não informado**; a confirmação continua sendo validada pela consulta segura da transação na EvoPay, sem inferir uma data de expiração local.

> Nunca compartilhe o código copia e cola, a URL do QR Code ou referências completas de transação fora do atendimento estritamente necessário. A área administrativa mascara identificadores de Telegram e de transação por padrão.

## Rotina semanal recomendada

1. Conferir pagamentos pendentes e possíveis falhas de callback.
2. Revisar os logs de automação e mensagens que não foram entregues.
3. Conferir se o bot ainda possui o cargo de administrador e permissões no grupo.
4. Atualizar planos antes de campanhas ou alterações de preço.
5. Revisar as obrigações de conteúdo, idade mínima e proteção de consumidores aplicáveis ao negócio.
