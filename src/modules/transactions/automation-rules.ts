/** Quy tắc tự phân loại: so khớp một trường của giao dịch với giá trị cấu hình. */
export type AutomationRuleLike = {
  field: string;
  operator: string;
  value: string;
  categoryId: string | null;
  tagName: string | null;
};

export type AutomationSubject = {
  amount: number;
  note?: string | null;
  payee?: string | null;
  reference?: string | null;
};

/** Giao dịch có khớp quy tắc không. Chuỗi so sánh không phân biệt hoa thường; `gte`/`lte` so sánh số. */
export function matchesRule(
  rule: Pick<AutomationRuleLike, 'field' | 'operator' | 'value'>,
  subject: AutomationSubject
) {
  const raw =
    rule.field === 'amount'
      ? String(subject.amount)
      : String(subject[rule.field as 'note' | 'payee' | 'reference'] ?? '');
  const left = raw.toLocaleLowerCase('vi');
  const right = rule.value.toLocaleLowerCase('vi');
  const numeric = Number(raw);
  const target = Number(rule.value);
  switch (rule.operator) {
    case 'contains':
      return left.includes(right);
    case 'equals':
      return left === right;
    case 'startsWith':
      return left.startsWith(right);
    case 'gte':
      return Number.isFinite(numeric) && numeric >= target;
    case 'lte':
      return Number.isFinite(numeric) && numeric <= target;
    default:
      return false;
  }
}

/** Kết quả áp các quy tắc theo thứ tự ưu tiên: danh mục đầu tiên khớp (nếu giao dịch chưa có) và mọi nhãn khớp. */
export function resolveAutomation(rules: AutomationRuleLike[], subject: AutomationSubject, categoryId?: string | null) {
  let resolvedCategory = categoryId;
  const tagNames: string[] = [];
  for (const rule of rules) {
    if (!matchesRule(rule, subject)) continue;
    if (!resolvedCategory && rule.categoryId) resolvedCategory = rule.categoryId;
    if (rule.tagName) tagNames.push(rule.tagName);
  }
  return { categoryId: resolvedCategory, tagNames };
}
