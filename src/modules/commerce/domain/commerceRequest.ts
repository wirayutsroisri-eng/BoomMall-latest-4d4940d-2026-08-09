/**
 * Pure commerce request error classification.
 * No React Native / network imports — unit-testable in Node and shared by the
 * commerce HTTP layer and the inventory sync retry policy.
 */

export type CommerceRequestKind =
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'SERVER_ERROR'
  | 'PARSE_ERROR'
  | 'HTTP_ERROR';

export class CommerceRequestError extends Error {
  readonly kind: CommerceRequestKind;
  readonly status?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    kind: CommerceRequestKind,
    status?: number,
    requestId?: string,
  ) {
    super(message);
    this.name = 'CommerceRequestError';
    this.kind = kind;
    this.status = status;
    this.requestId = requestId;
  }
}

export function isCommerceRequestError(error: unknown): error is CommerceRequestError {
  return error instanceof CommerceRequestError;
}

/** HTTP status → category. Order matters: 4xx/5xx beat parse issues on proxy HTML pages. */
export function httpErrorKind(status: number, parseFailed: boolean): CommerceRequestKind {
  if (status === 401) return 'UNAUTHORIZED';
  if (status === 403) return 'FORBIDDEN';
  if (status >= 500) return 'SERVER_ERROR';
  if (status >= 200 && status < 300) return parseFailed ? 'PARSE_ERROR' : 'HTTP_ERROR';
  return 'HTTP_ERROR'; // deterministic 4xx — never retried
}

/** Retry only transient failures — never 4xx (no retry loops) and never a local parse bug. */
export function isRetryableCommerceKind(kind: CommerceRequestKind): boolean {
  return kind === 'NETWORK_ERROR' || kind === 'TIMEOUT' || kind === 'SERVER_ERROR';
}

export function isRetryableCommerceError(error: unknown): boolean {
  if (!isCommerceRequestError(error)) return true; // legacy / unexpected errors keep old retry semantics
  return isRetryableCommerceKind(error.kind);
}
