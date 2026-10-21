import { useSyncExternalStore } from 'react';

/** Ngưỡng điện thoại: từ 760px trở xuống dùng vỏ điện thoại, trên đó dùng vỏ máy tính. */
export const PHONE_QUERY = '(max-width: 760px)';

function subscribe(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

export function useIsPhone(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  );
}
