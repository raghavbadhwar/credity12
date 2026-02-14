import * as SecureStore from 'expo-secure-store';
import type { AppRole } from '../types';

function keyFor(role: AppRole): string {
  return `credverse:${role}:refresh-token`;
}

export async function storeRefreshToken(role: AppRole, token: string): Promise<void> {
  await SecureStore.setItemAsync(keyFor(role), token);
}

export async function getRefreshToken(role: AppRole): Promise<string | null> {
  return SecureStore.getItemAsync(keyFor(role));
}

export async function clearRefreshToken(role: AppRole): Promise<void> {
  await SecureStore.deleteItemAsync(keyFor(role));
}
