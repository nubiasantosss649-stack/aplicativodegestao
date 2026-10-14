import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

/** Gera PDF a partir do HTML e abre o compartilhamento (WhatsApp, e-mail, etc.). */
export async function shareHtmlAsPdf(html: string, title: string): Promise<void> {
  if (Platform.OS === 'web') {
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: title, UTI: 'com.adobe.pdf' });
  } else {
    await Print.printAsync({ uri });
  }
}
