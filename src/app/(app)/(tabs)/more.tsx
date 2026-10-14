import { router, type Href } from 'expo-router';

import { ListItem, Screen, Section, Text, type IconName } from '@/components/ui';
import { useBusiness } from '@/providers/BusinessProvider';

interface Item {
  title: string;
  subtitle: string;
  icon: IconName;
  href: Href;
  managerOnly?: boolean;
}

const GROUPS: { title: string; items: Item[] }[] = [
  {
    title: 'Inteligência',
    items: [
      { title: 'Assistente IA', subtitle: 'Pergunte sobre vendas, lucro, estoque e fiados', icon: 'sparkles', href: '/assistant' },
      { title: 'Relatórios', subtitle: 'Lucro por produto, horários, clientes · PDF e Excel', icon: 'bar-chart', href: '/reports' },
      { title: 'Recomendações', subtitle: 'Alertas de prejuízo, reposição e preços', icon: 'bulb', href: '/insights' },
    ],
  },
  {
    title: 'Vendas e clientes',
    items: [
      { title: 'Histórico de vendas', subtitle: 'Consultar, cancelar e reenviar comprovantes', icon: 'receipt', href: '/sales' },
      { title: 'Fiados', subtitle: 'Quem está devendo e cobranças', icon: 'wallet', href: '/receivables' },
      { title: 'Recibos e orçamentos', subtitle: 'Orçamentos, recibos e histórico de documentos', icon: 'document-text', href: '/documents' },
    ],
  },
  {
    title: 'Estoque e finanças',
    items: [
      { title: 'Estoque', subtitle: 'Alertas de estoque baixo e valor em estoque', icon: 'cube', href: '/stock' },
      { title: 'Financeiro', subtitle: 'Fluxo de caixa, despesas e lucro', icon: 'stats-chart', href: '/finance', managerOnly: true },
      { title: 'Contas a pagar', subtitle: 'Vencimentos e pagamentos', icon: 'calendar', href: '/finance/payables', managerOnly: true },
    ],
  },
  {
    title: 'Conta',
    items: [
      { title: 'Plano e assinatura', subtitle: 'Plano atual, limites e Pro IA', icon: 'diamond', href: '/subscription/manage' },
      { title: 'Configurações', subtitle: 'Negócio, perfil, aparência e sair', icon: 'settings', href: '/settings' },
      { title: 'Ajuda e suporte', subtitle: 'Dúvidas frequentes e contato', icon: 'help-circle', href: '/help' },
    ],
  },
];

export default function More() {
  const { isManager, business } = useBusiness();
  return (
    <Screen>
      <Text variant="title">{business?.name}</Text>
      {GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          {g.items
            .filter((i) => !i.managerOnly || isManager)
            .map((i) => (
              <ListItem key={i.title} icon={i.icon} title={i.title} subtitle={i.subtitle} chevron onPress={() => router.push(i.href)} />
            ))}
        </Section>
      ))}
    </Screen>
  );
}
