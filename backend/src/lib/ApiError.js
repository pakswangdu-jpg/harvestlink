



export class ApiError extends Error {
  constructor(message, status = 400, code, title, details) {
    super(message);
    this.status = status;
    this.code = code;
    if (title) this.title = title;
    if (details && typeof details === 'object') Object.assign(this, details);
  }
}
