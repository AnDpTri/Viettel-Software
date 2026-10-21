/** Bộ biểu tượng nét mảnh 16px dùng chung cho thanh điều hướng; màu theo chữ xung quanh. */
const PATHS = {
  home: 'M2.5 7.5 8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H9.5V10h-3v3.5H3a.5.5 0 0 1-.5-.5z',
  swap: 'M3 5.5h9.5M10 3l2.5 2.5L10 8M13 10.5H3.5M6 8l-2.5 2.5L6 13',
  plan: 'M8 2.5a5.5 5.5 0 1 0 5.5 5.5H8z M10 2.8a5.5 5.5 0 0 1 3.2 3.2H10z',
  assistant: 'M8 2.5 9.4 6.6 13.5 8 9.4 9.4 8 13.5 6.6 9.4 2.5 8l4.1-1.4z',
  wallet: 'M2.5 4.5h10a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1zM2.5 4.5 11 3v1.5M10.5 8.8h3',
  category: 'M2.5 4h11M2.5 8h11M2.5 12h7',
  help: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM6.4 6.4a1.7 1.7 0 1 1 2.4 1.6c-.5.3-.8.6-.8 1.2M8 11.4v.1',
  code: 'M5.5 4.5 2 8l3.5 3.5M10.5 4.5 14 8l-3.5 3.5',
  close: 'M4 4l8 8M12 4l-8 8',
  chat: 'M3 4.5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H7.5L5 13v-2H4a1 1 0 0 1-1-1z',
  menu: 'M2.5 4.5h11M2.5 8h11M2.5 11.5h11',
  check: 'M3.5 8.5 6.5 11.5 12.5 4.5',
  attach: 'M12.5 7.5 8 12a3 3 0 0 1-4.2-4.2l4.7-4.7a2 2 0 0 1 2.8 2.8L6.7 10.5a1 1 0 0 1-1.4-1.4L9.5 5',
  calendar: 'M3 4.5h10v8.5H3zM3 7h10M5.5 3v3M10.5 3v3',
  goal: 'M8 13.5a5.5 5.5 0 1 0 0-11 5.5 5.5 0 0 0 0 11zM8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4z',
  bank: 'M2.5 6 8 3l5.5 3M3.5 6.5v5M6.5 6.5v5M9.5 6.5v5M12.5 6.5v5M2.5 13h11',
  phone: 'M5 2.5h6a.5.5 0 0 1 .5.5v10a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V3a.5.5 0 0 1 .5-.5zM7 11.5h2',
  logout: 'M6.5 3H4a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h2.5M10 5.5 12.5 8 10 10.5M12.5 8H6.5'
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** Dấu của Sổ Mộc: một trang sổ kẻ dòng, dòng cuối ngắn đánh dấu bằng màu dữ liệu. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="2.5" y="2.5" width="23" height="23" rx="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 9.5h12M8 14h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8 18.5h6" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
