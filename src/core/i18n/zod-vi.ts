import { z, ZodErrorMap, ZodIssueCode } from 'zod';

/** Thông báo validation mặc định bằng tiếng Việt cho mọi schema Zod. Schema nào đã tự đặt thông báo thì giữ nguyên. */
export const vietnameseErrorMap: ZodErrorMap = (issue) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.input === undefined || issue.input === null) return { message: 'Trường này là bắt buộc.' };
      if (issue.expected === 'date') return { message: 'Ngày không hợp lệ.' };
      return { message: `Kiểu dữ liệu không đúng: cần ${issue.expected}, nhận ${typeof issue.input}.` };
    case ZodIssueCode.too_small:
      if (issue.origin === 'string')
        return { message: issue.minimum === 1 ? 'Không được để trống.' : `Cần ít nhất ${issue.minimum} ký tự.` };
      if (issue.origin === 'array') return { message: `Cần ít nhất ${issue.minimum} phần tử.` };
      if (issue.origin === 'number' || issue.origin === 'int')
        return {
          message: issue.inclusive
            ? `Giá trị phải từ ${issue.minimum} trở lên.`
            : `Giá trị phải lớn hơn ${issue.minimum}.`
        };
      break;
    case ZodIssueCode.too_big:
      if (issue.origin === 'string') return { message: `Tối đa ${issue.maximum} ký tự.` };
      if (issue.origin === 'array') return { message: `Tối đa ${issue.maximum} phần tử.` };
      if (issue.origin === 'number' || issue.origin === 'int')
        return {
          message: issue.inclusive ? `Giá trị tối đa là ${issue.maximum}.` : `Giá trị phải nhỏ hơn ${issue.maximum}.`
        };
      break;
    case ZodIssueCode.invalid_format:
      if (issue.format === 'email') return { message: 'Email không hợp lệ.' };
      if (issue.format === 'uuid') return { message: 'ID không đúng định dạng UUID.' };
      if (issue.format === 'url') return { message: 'Đường dẫn không hợp lệ.' };
      if (issue.format === 'datetime' || issue.format === 'date')
        return { message: 'Ngày giờ không đúng định dạng ISO 8601.' };
      if (issue.format === 'regex') return { message: 'Giá trị không đúng định dạng.' };
      break;
    case ZodIssueCode.invalid_value:
      return { message: `Giá trị không hợp lệ. Chỉ chấp nhận: ${issue.values.join(', ')}.` };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Trường không được hỗ trợ: ${issue.keys.join(', ')}.` };
    case ZodIssueCode.invalid_union:
      return { message: 'Dữ liệu không khớp với định dạng nào được hỗ trợ.' };
    default:
      break;
  }
  return { message: 'Giá trị không hợp lệ.' };
};

z.setErrorMap(vietnameseErrorMap);
