import { useEffect, useRef, useState } from 'react';

/** Chiều rộng hiện tại (px) của một phần tử, cập nhật khi đổi cỡ; dùng để vẽ SVG đúng cỡ chữ thật. */
export function useElementWidth<T extends HTMLElement>(fallback = 320) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0) setWidth(Math.round(rect.width));
    };
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return { ref, width };
}
