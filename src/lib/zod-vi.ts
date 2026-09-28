import { z, ZodErrorMap, ZodIssueCode } from 'zod';

/** Thông báo validation mặc định bằng tiếng Việt cho mọi schema Zod. Schema nào đã tự đặt thông báo thì giữ nguyên. */
export const vietnameseErrorMap: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return { message: 'Trường này là bắt buộc.' };
      return { message: `Kiểu dữ liệu không đúng: cần ${issue.expected}, nhận ${issue.received}.` };
    case ZodIssueCode.too_small:
      if (issue.type === 'string') return { message: issue.minimum === 1 ? 'Không được để trống.' : `Cần ít nhất ${issue.minimum} ký tự.` };
      if (issue.type === 'array') return { message: `Cần ít nhất ${issue.minimum} phần tử.` };
      if (issue.type === 'number') return { message: issue.inclusive ? `Giá trị phải từ ${issue.minimum} trở lên.` : `Giá trị phải lớn hơn ${issue.minimum}.` };
      break;
    case ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Tối đa ${issue.maximum} ký tự.` };
      if (issue.type === 'array') return { message: `Tối đa ${issue.maximum} phần tử.` };
      if (issue.type === 'number') return { message: issue.inclusive ? `Giá trị tối đa là ${issue.maximum}.` : `Giá trị phải nhỏ hơn ${issue.maximum}.` };
      break;
    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return { message: 'Email không hợp lệ.' };
      if (issue.validation === 'uuid') return { message: 'ID không đúng định dạng UUID.' };
      if (issue.validation === 'url') return { message: 'Đường dẫn không hợp lệ.' };
      if (issue.validation === 'datetime' || issue.validation === 'date') return { message: 'Ngày giờ không đúng định dạng ISO 8601.' };
      if (issue.validation === 'regex') return { message: 'Giá trị không đúng định dạng.' };
      break;
    case ZodIssueCode.invalid_enum_value:
      return { message: `Giá trị không hợp lệ. Chỉ chấp nhận: ${issue.options.join(', ')}.` };
    case ZodIssueCode.invalid_date:
      return { message: 'Ngày không hợp lệ.' };
    case ZodIssueCode.unrecognized_keys:
      return { message: `Trường không được hỗ trợ: ${issue.keys.join(', ')}.` };
    case ZodIssueCode.invalid_union:
      return { message: 'Dữ liệu không khớp với định dạng nào được hỗ trợ.' };
    default:
      break;
  }
  return { message: ctx.defaultError };
};

z.setErrorMap(vietnameseErrorMap);
