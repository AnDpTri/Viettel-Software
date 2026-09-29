/* eslint-disable @typescript-eslint/no-explicit-any -- phần tử được đọc/ghi thuộc tính của nhiều loại (input, form, details…). */

/** Phần tử đầu tiên khớp selector. */
export const $ = (selector: string): any => document.querySelector(selector);

/** Mọi phần tử khớp selector, dạng mảng. */
export const $$ = (selector: string): any[] => [...document.querySelectorAll(selector)];

/** Tải một Blob về máy với tên tệp cho trước. */
export function saveBlob(blob: Blob, filename: string, revokeDelay = 0) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  if (revokeDelay) setTimeout(() => URL.revokeObjectURL(url), revokeDelay);
  else URL.revokeObjectURL(url);
}
