/**
 * MINUTAS de Termos de Uso e Política de Privacidade (LGPD).
 * Devem ser revisadas por assessoria jurídica antes da publicação nas lojas.
 */
export interface LegalDoc {
  title: string;
  updatedAt: string;
  sections: { heading: string; body: string }[];
}

export const TERMS: LegalDoc = {
  title: 'Termos de Uso',
  updatedAt: '13/10/2026',
  sections: [
    {
      heading: '1. O serviço',
      body: 'O Gestão Fácil IA é um aplicativo de gestão para pequenos negócios: controle de vendas, estoque, clientes, fiados e finanças. Os comprovantes gerados NÃO possuem valor fiscal e não substituem nota fiscal.',
    },
    {
      heading: '2. Cadastro',
      body: 'Você é responsável pelas informações cadastradas e pela segurança da sua senha. O cadastro pode ser feito com CPF, CNPJ ou sem documento.',
    },
    {
      heading: '3. Pagamentos registrados',
      body: 'O aplicativo apenas REGISTRA pagamentos informados por você (dinheiro, Pix, cartão, fiado). Não processamos pagamentos nem acessamos contas bancárias.',
    },
    {
      heading: '4. Cobranças',
      body: 'Mensagens de cobrança são enviadas somente por ação sua, pelo WhatsApp. Você é responsável por cobrar de forma respeitosa e conforme o Código de Defesa do Consumidor.',
    },
    {
      heading: '5. Seus dados',
      body: 'Os dados do seu negócio pertencem a você. Você pode consultá-los, exportá-los e solicitar a exclusão da conta a qualquer momento.',
    },
    {
      heading: '6. Planos e assinatura',
      body: 'O Plano Grátis tem limites de produtos e vendas mensais. O Pro IA é uma assinatura mensal com renovação automática, cobrada pela Google Play ou App Store, que pode ser cancelada a qualquer momento na loja. Após o cancelamento, o Pro vale até o fim do período pago e os dados continuam disponíveis para consulta e exportação.',
    },
    {
      heading: '7. Limitação de responsabilidade',
      body: 'Os indicadores (como lucro estimado) são calculados a partir dos dados informados e servem como apoio à gestão, não como aconselhamento contábil.',
    },
  ],
};

export const PRIVACY: LegalDoc = {
  title: 'Política de Privacidade',
  updatedAt: '13/10/2026',
  sections: [
    {
      heading: 'Dados coletados',
      body: 'Nome, e-mail e telefone da conta; dados do negócio (nome, tipo, CPF/CNPJ opcional); e os registros que você cria: produtos, vendas, clientes, fiados e lançamentos financeiros.',
    },
    {
      heading: 'Finalidade',
      body: 'Usamos os dados exclusivamente para prestar o serviço de gestão, autenticar seu acesso e gerar relatórios para você. Não vendemos dados a terceiros.',
    },
    {
      heading: 'Dados de clientes do seu negócio',
      body: 'Você é o controlador dos dados dos seus clientes. Cadastre apenas o necessário (nome e telefone) e utilize-os somente para a relação comercial.',
    },
    {
      heading: 'Segurança',
      body: 'Os dados trafegam criptografados (HTTPS), ficam isolados por negócio com regras de acesso no banco de dados (Row Level Security) e a sessão é guardada no armazenamento seguro do aparelho.',
    },
    {
      heading: 'Seus direitos (LGPD)',
      body: 'Você pode acessar, corrigir, exportar e excluir seus dados. Para exclusão da conta ou dúvidas, use a tela Ajuda e Suporte.',
    },
    {
      heading: 'Operadores',
      body: 'Utilizamos Supabase (banco de dados e autenticação) e RevenueCat (gestão de assinaturas, que recebe apenas o identificador da conta e os dados da compra informados pela loja). No Assistente IA (plano Pro), as perguntas e os resultados das consultas necessários para respondê-las (totais, nomes de produtos e de clientes devedores, sem telefones) são enviados à Anthropic (Claude), que atua como operadora. Os números são calculados pelo nosso sistema; a IA apenas os explica.',
    },
  ],
};
