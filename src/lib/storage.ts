import AsyncStorage from '@react-native-async-storage/async-storage';

/** Preferências não sensíveis do usuário (tema, negócio selecionado, onboarding). */
export const prefs = {
  async get(key: string): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(`gf:${key}`);
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      await AsyncStorage.setItem(`gf:${key}`, value);
    } catch {
      // preferência não crítica
    }
  },
  async remove(key: string): Promise<void> {
    try {
      await AsyncStorage.removeItem(`gf:${key}`);
    } catch {
      // preferência não crítica
    }
  },
};
