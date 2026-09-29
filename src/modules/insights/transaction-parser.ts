/** Bỏ dấu và chữ hoa để so khớp tên ví/danh mục trong câu người dùng gõ. */
export function normalizedText(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function parseAmount(raw: string, unit?: string) {
  const compact = raw.replace(/\s/g, '');
  const multiplier =
    unit === 'ty' || unit === 'ti'
      ? 1_000_000_000
      : unit === 'trieu' || unit === 'tr'
        ? 1_000_000
        : unit === 'nghin' || unit === 'ngan' || unit === 'k'
          ? 1_000
          : 1;
  let normalized = compact;
  if (multiplier > 1 && /^[0-9]+[.,][0-9]{1,2}$/.test(compact)) normalized = compact.replace(',', '.');
  else if (/[.,]/.test(compact)) {
    const parts = compact.split(/[.,]/);
    normalized =
      parts.length > 1 && parts.slice(1).every((part) => part.length === 3)
        ? parts.join('')
        : compact.replace(',', '.');
  }
  return Number(normalized) * multiplier;
}

/** Hiểu câu tiếng Việt như "Ăn trưa 75k hôm qua" thành giao dịch nháp; người dùng xác nhận trước khi lưu. */
export function parseVietnameseTransaction(text: string) {
  const plain = normalizedText(text).replace(/đ/g, 'd');
  const match =
    plain.match(/(\d[\d\s.,]*?)\s*(ty|ti|trieu|tr|nghin|ngan|k|vnd|d)(?=\s|$|[^a-z])/i) ??
    plain.match(/\b(\d[\d.,]*)\b/);
  const amount = match ? parseAmount(match[1]!, match[2]) : 0;
  const type = ['nhan', 'luong', 'thu nhap', 'duoc tra', 'hoan tien', 'thu '].some((word) => plain.includes(word))
    ? ('INCOME' as const)
    : ('EXPENSE' as const);
  const date = new Date();
  if (plain.includes('hom qua')) date.setDate(date.getDate() - 1);
  if (plain.includes('hom kia')) date.setDate(date.getDate() - 2);
  const exact = plain.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (exact)
    date.setFullYear(
      exact[3] ? Number(exact[3]!.length === 2 ? `20${exact[3]}` : exact[3]) : date.getFullYear(),
      Number(exact[2]) - 1,
      Number(exact[1])
    );
  const note = text
    .replace(match?.[0] ?? '', '')
    .replace(/\b(hôm nay|hom nay|hôm qua|hom qua|hôm kia|hom kia)\b/gi, '')
    .trim();
  return {
    type,
    amount,
    occurredAt: date.toISOString(),
    note,
    confidence: amount > 0 ? 0.88 : 0.4,
    requiresConfirmation: true
  };
}

/** Trích cửa hàng, số tiền lớn nhất và ngày từ văn bản OCR của hóa đơn. */
export function extractReceiptText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const amounts = [...text.matchAll(/(?:TOTAL|TỔNG|THANH TOÁN)?\s*[: ]*([\d.,]{3,})\s*(?:VND|đ|₫)?/gi)]
    .map((match) => parseAmount(match[1]!))
    .filter(Number.isFinite);
  const dateMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  const occurredAt = dateMatch
    ? new Date(
        `${dateMatch[3]!.length === 2 ? `20${dateMatch[3]}` : dateMatch[3]}-${dateMatch[2]!.padStart(2, '0')}-${dateMatch[1]!.padStart(2, '0')}T12:00:00Z`
      )
    : null;
  return {
    merchant: lines[0] ?? null,
    amount: amounts.length ? Math.max(...amounts) : null,
    occurredAt,
    rawText: text,
    confidence: amounts.length ? 0.75 : 0.35,
    requiresConfirmation: true
  };
}
