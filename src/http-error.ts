const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Please log in',
  403: 'You do not have permission to do that',
  404: "This page doesn't exist, or you don't have access to it.",
  409: 'Conflict',
};

/** Per-field validation messages, e.g. { email: ['Already registered'] }. */
export type FieldErrors = Record<string, string[] | undefined>;

/** An error that maps directly onto an HTTP response. */
export class HttpError extends Error {
  readonly status: number;
  readonly details: FieldErrors | undefined;

  constructor(status: number, message: string = DEFAULT_MESSAGES[status] ?? 'Error', details?: FieldErrors) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const notFound = (): HttpError => new HttpError(404);
