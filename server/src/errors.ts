export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const unavailable = () =>
  new AppError(
    503,
    "GOOGLE_SHEETS_UNAVAILABLE",
    "Google Sheets is not configured. Follow the setup guide to connect your company spreadsheet.",
  );
export function assert(
  condition: unknown,
  status: number,
  code: string,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, code, message);
}
