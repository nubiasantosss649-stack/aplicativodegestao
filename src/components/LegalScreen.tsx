import { Card, Screen, Text } from '@/components/ui';
import type { LegalDoc } from '@/content/legal';

export function LegalScreen({ doc }: { doc: LegalDoc }) {
  return (
    <Screen>
      <Text tone="muted">Última atualização: {doc.updatedAt}</Text>
      {doc.sections.map((s) => (
        <Card key={s.heading} style={{ gap: 6 }}>
          <Text variant="subtitle">{s.heading}</Text>
          <Text>{s.body}</Text>
        </Card>
      ))}
    </Screen>
  );
}
