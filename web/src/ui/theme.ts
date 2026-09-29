import type { ThemePreference } from '../api/types';
import { storageGet, storageSet } from '../lib/storage';

const THEME_KEY = 'finance_theme';

/** Áp dụng giao diện: SYSTEM để trình duyệt theo cài đặt máy (CSS dùng `light-dark()`), LIGHT/DARK ép cố định. */
export function applyTheme(theme: ThemePreference) {
  const root = document.documentElement;
  if (theme === 'DARK') root.dataset.theme = 'dark';
  else if (theme === 'LIGHT') root.dataset.theme = 'light';
  else delete root.dataset.theme;
  storageSet(THEME_KEY, theme);
}

export function storedTheme(): ThemePreference {
  const value = storageGet(THEME_KEY);
  return value === 'DARK' || value === 'LIGHT' ? value : 'SYSTEM';
}

/** Giao diện đang hiển thị thực tế, kể cả khi đang theo hệ thống. */
export function isDarkNow() {
  const theme = document.documentElement.dataset.theme;
  if (theme) return theme === 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
