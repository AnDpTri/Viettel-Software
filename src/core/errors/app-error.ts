export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (resource: string) => new AppError(404, 'NOT_FOUND', `${resource} không tồn tại.`);
export const forbidden = () => new AppError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện thao tác này.');
