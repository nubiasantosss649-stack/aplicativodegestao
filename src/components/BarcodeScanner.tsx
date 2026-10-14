import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Text } from '@/components/ui';
import { spacing } from '@/theme/colors';

interface Props {
  visible: boolean;
  onClose: () => void;
  onScanned: (code: string) => void;
}

/** Leitor de código de barras pela câmera (quando disponível no aparelho). */
export function BarcodeScanner({ visible, onClose, onScanned }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} onShow={() => (handled.current = false)}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text variant="subtitle" tone="onPrimary">
            Aponte para o código de barras
          </Text>
          <Pressable accessibilityLabel="Fechar leitor" onPress={onClose} hitSlop={12}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
        </View>
        {Platform.OS === 'web' ? (
          <View style={styles.center}>
            <Text tone="onPrimary" center>
              A leitura pela câmera está disponível no aplicativo para Android e iOS. Digite o código na busca.
            </Text>
          </View>
        ) : !permission ? null : !permission.granted ? (
          <View style={styles.center}>
            <Text tone="onPrimary" center>
              Precisamos da sua permissão para usar a câmera e ler códigos de barras.
            </Text>
            <Button title="Permitir câmera" icon="camera" onPress={requestPermission} />
          </View>
        ) : (
          <View style={styles.flex}>
            <CameraView
              style={styles.flex}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'code93', 'itf14', 'codabar', 'qr'],
              }}
              onBarcodeScanned={(result) => {
                if (handled.current || !result.data) return;
                handled.current = true;
                onScanned(result.data.trim());
              }}
            />
            <View pointerEvents="none" style={styles.frame} />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.lg },
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.lg },
  frame: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    top: '35%',
    height: '22%',
    borderWidth: 3,
    borderColor: '#34D399',
    borderRadius: 16,
  },
});
