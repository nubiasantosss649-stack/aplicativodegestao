import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Armazenamento da sessão do Supabase.
 * No celular usa o Keychain/Keystore (expo-secure-store). Como cada item do
 * SecureStore tem limite de ~2 KB, o valor é dividido em partes.
 * Na web usa o armazenamento do navegador.
 */
const CHUNK_SIZE = 1800;
const safeKey = (key: string) => key.replace(/[^A-Za-z0-9._-]/g, '_');

const nativeStorage = {
  async getItem(key: string): Promise<string | null> {
    const base = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${base}__n`);
    if (!countRaw) return null;
    const count = Number(countRaw);
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${base}__${i}`);
      if (part == null) return null;
      parts.push(part);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string): Promise<void> {
    const base = safeKey(key);
    await nativeStorage.removeItem(key);
    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i++) {
      await SecureStore.setItemAsync(`${base}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${base}__n`, String(count));
  },
  async removeItem(key: string): Promise<void> {
    const base = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${base}__n`);
    const count = Number(countRaw ?? 0);
    for (let i = 0; i < count; i++) await SecureStore.deleteItemAsync(`${base}__${i}`);
    await SecureStore.deleteItemAsync(`${base}__n`);
  },
};

export const authStorage = Platform.OS === 'web' ? AsyncStorage : nativeStorage;
