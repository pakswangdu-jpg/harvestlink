// Thrown from controllers to carry an HTTP status alongside the user-facing message —
// a plain `throw new Error('...')` still works fine (errorHandler defaults it to 500),
// but most business-logic failures (validation, ownership, not-found) want a specific
// 4xx status so the frontend's existing `error.message` display pattern stays accurate.
export class ApiError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
