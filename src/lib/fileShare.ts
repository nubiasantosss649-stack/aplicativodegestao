import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Salva bytes em arquivo temporário e abre o compartilhamento (ou baixa, na web). */
export async function shareBytes(fileName: string, bytes: Uint8Array, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([bytes as BlobPart], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return;
  }
  const { File, Paths } = await import('expo-file-system');
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  file.write(bytes);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Compartilhamento indisponível neste aparelho.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

export function fileStamp(date = new Date()): string {
  const p = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
