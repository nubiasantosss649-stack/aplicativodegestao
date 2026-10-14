# Ficha das lojas (pt-BR)

Imagens: `store/framed/ios-6.9/` (1290×2796, App Store 6,9"), `store/framed/android-phone/` (1080×2160, Google Play),
`store/feature-graphic.png` (1024×500, Google Play), ícone `assets/icon.png` (1024×1024).
Capturas brutas (sem moldura) em `store/screenshots/`. Para regenerar: `npm run stack:start`, `npm run seed:demo`,
servir o build web e `npm run screenshots` (ver `docs/LAUNCH.md`).

> As capturas usam a conta de demonstração com **dados fictícios** de um mercadinho; a tela do Assistente IA mostra
> o estado inicial (sem resposta gerada).

## Textos

| Campo | Limite | Texto |
|---|---|---|
| Nome do app | 30 | Gestão Fácil IA |
| Subtítulo (App Store) | 30 | Vendas, estoque e fiado fácil |
| Descrição curta (Play) | 80 | Controle vendas, estoque, fiados e finanças do seu negócio. Com assistente IA. |
| Texto promocional (App Store) | 170 | Descubra onde seu negócio está perdendo dinheiro. Vendas, estoque, fiados e lucro em um só lugar — com Assistente IA no plano Pro. |
| Palavras-chave (App Store) | 100 | gestão,vendas,estoque,fiado,mei,caixa,financeiro,comércio,mercadinho,salão,pdv,controle,lucro |
| Categoria | — | Negócios (principal) · Finanças (secundária, App Store) |
| Classificação etária | — | Livre / 4+ (sem conteúdo sensível) |

### Descrição completa

Seu negócio organizado, suas vendas crescendo.

O Gestão Fácil IA foi feito para MEIs, mercadinhos, lojas de roupas, salões de beleza, prestadores de serviço e
pequenos negócios que querem sair do caderno sem complicação. Não precisa ter empresa aberta: cadastre com CPF,
CNPJ ou sem documento.

VENDA RÁPIDA
• Busque o produto ou leia o código de barras com a câmera
• Dinheiro, Pix, cartão, fiado ou pagamento misto, com cálculo de troco
• Comprovante (não fiscal) em PDF para enviar pelo WhatsApp
• Cancelamento com motivo registrado e estoque devolvido automaticamente

ESTOQUE SEMPRE EM DIA
• Baixa automática a cada venda
• Entrada de mercadoria e ajustes com justificativa
• Alerta de estoque baixo e sugestão de reposição
• Margem de lucro e sugestão de preço de venda

FIADO SOB CONTROLE
• Saiba quem está devendo e quem está atrasado
• Receba pagamentos parciais ou totais
• Envie a cobrança pelo WhatsApp com uma mensagem pronta

FINANCEIRO SIMPLES
• Despesas, receitas e contas a pagar
• Fluxo de caixa: o dinheiro que realmente entrou e saiu
• Lucro estimado: faturamento menos custos e despesas

RECIBOS E ORÇAMENTOS
• Orçamentos em PDF que viram venda com um toque
• Recibos com valor por extenso

PLANO PRO IA
• Produtos e vendas ilimitados
• Assistente IA: pergunte “Quanto vendi hoje?”, “Qual foi meu lucro neste mês?”, “Quem está me devendo?”
• Relatórios detalhados: lucro por produto, horários de movimento, melhores clientes
• Recomendações: alertas de possíveis prejuízos, reposição de estoque e preços sugeridos
• Exportação em PDF e Excel

Plano Grátis: até 30 produtos ativos e 50 vendas por mês, clientes, fiados e despesas.
Pro IA: assinatura mensal com renovação automática, cobrada pela loja. Cancele quando quiser.

Seus dados são seus: exporte tudo em Excel e exclua a conta a qualquer momento pelo app.

Os documentos gerados não possuem valor fiscal.

## URLs (publicar a pasta `site/`)

| Campo | URL |
|---|---|
| Política de privacidade | `https://<seu-domínio>/privacidade.html` |
| Termos de uso (EULA) | `https://<seu-domínio>/termos.html` |
| Exclusão de conta (Google Play) | `https://<seu-domínio>/excluir-conta.html` |
| Site / suporte | `https://<seu-domínio>/` |

## Google Play — Segurança dos dados

| Pergunta | Resposta |
|---|---|
| Coleta ou compartilha dados? | Sim, coleta. Não compartilha com terceiros para fins próprios deles (os provedores atuam como operadores) |
| Criptografia em trânsito | Sim |
| Usuário pode pedir exclusão | Sim (no app e pela URL de exclusão) |
| Informações pessoais | Nome, e-mail, telefone (opcional) — funcionalidade do app e gerenciamento da conta; obrigatório: nome e e-mail |
| Informações financeiras | Histórico de compras (assinatura) — gerenciamento da conta; “Outras informações financeiras” (vendas, fiados, despesas registradas pelo usuário) — funcionalidade do app |
| Fotos | Fotos de produtos (opcional) — funcionalidade do app |
| Arquivos e documentos | Não (PDFs/Excel são gerados no aparelho e compartilhados pelo usuário) |
| Atividade no app | Interações com o app: não coletamos análise de uso |
| IDs do dispositivo | Não |
| Localização, contatos, mensagens | Não |

## App Store — Privacidade do app (rótulos)

- **Dados vinculados a você:** Informações de contato (nome, e-mail, telefone); Compras (histórico de assinatura);
  Conteúdo do usuário (fotos de produtos, outros conteúdos: registros do negócio). Finalidade: funcionalidade do app.
- **Rastreamento:** Não.
- **Dados não coletados:** localização, contatos, histórico de navegação, identificadores de publicidade, diagnóstico.

## Assinatura (metadados)

| Campo | Valor |
|---|---|
| ID do produto | `gestao_pro_mensal` (mesmo nas duas lojas) |
| Grupo (App Store) | Gestão Fácil Pro |
| Nome exibido | Pro IA mensal |
| Descrição | Produtos e vendas ilimitados, Assistente IA, relatórios, recomendações e exportação. |
| Preço | R$ 39,90/mês |
| Oferta introdutória (opcional) | 7 dias grátis (novos assinantes) |
| Imagem de revisão (App Store) | `store/framed/ios-6.9/05-assistente-ia.png` |

## Informações para a revisão (App Review / Play)

- **Conta de teste:** crie no projeto de produção uma conta (ex.: `revisao@<seu-domínio>`) com dados de exemplo
  e informe e-mail/senha. Se quiser que o revisor veja o Pro sem comprar, conceda acesso promocional no RevenueCat
  (entitlement `pro`) para essa conta.
- **Notas:** “Aplicativo de gestão para pequenos negócios. Os pagamentos registrados (dinheiro, Pix, cartão, fiado) são
  apenas anotações do comerciante; o app não processa pagamentos. Assinatura Pro via compra no app. Exclusão de conta
  em Mais → Configurações → Excluir minha conta. Documentos gerados são não fiscais.”
- **Câmera:** usada apenas para ler código de barras (texto de permissão já configurado).
