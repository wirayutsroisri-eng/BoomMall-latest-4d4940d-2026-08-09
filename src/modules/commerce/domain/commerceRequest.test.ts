import { describe, expect, it } from 'vitest';
import {
  CommerceRequestError,
  httpErrorKind,
  isRetryableCommerceError,
  isRetryableCommerceKind,
} from './commerceRequest';

describe('commerce request error classification', () => {
  it('maps HTTP status to the right category', () => {
    expect(httpErrorKind(401, false)).toBe('UNAUTHORIZED');
    expect(httpErrorKind(403, false)).toBe('FORBIDDEN');
    expect(httpErrorKind(500, false)).toBe('SERVER_ERROR');
    expect(httpErrorKind(502, true)).toBe('SERVER_ERROR'); // proxy HTML page
    expect(httpErrorKind(400, true)).toBe('HTTP_ERROR'); // never 4xx-retry
    expect(httpErrorKind(200, true)).toBe('PARSE_ERROR');
    expect(httpErrorKind(404, false)).toBe('HTTP_ERROR');
  });

  it('retries only transient network/timeout/server errors', () => {
    expect(isRetryableCommerceKind('NETWORK_ERROR')).toBe(true);
    expect(isRetryableCommerceKind('TIMEOUT')).toBe(true);
    expect(isRetryableCommerceKind('SERVER_ERROR')).toBe(true);
    expect(isRetryableCommerceKind('UNAUTHORIZED')).toBe(false);
    expect(isRetryableCommerceKind('FORBIDDEN')).toBe(false);
    expect(isRetryableCommerceKind('PARSE_ERROR')).toBe(false);
    expect(isRetryableCommerceKind('HTTP_ERROR')).toBe(false);
  });

  it('never retries 4xx in a loop', () => {
    const error = new CommerceRequestError('เซสชันหมดอายุ', 'UNAUTHORIZED', 401, 'abc123');
    expect(isRetryableCommerceError(error)).toBe(false);
  });

  it('keeps legacy retry semantics for non-classified errors', () => {
    expect(isRetryableCommerceError(new Error('fetch failed'))).toBe(true);
    expect(isRetryableCommerceError('unexpected')).toBe(true);
  });

  it('exposes status/kind/requestId on the error', () => {
    const error = new CommerceRequestError('HTTP 503', 'SERVER_ERROR', 503, 'req_1');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CommerceRequestError');
    expect(error.kind).toBe('SERVER_ERROR');
    expect(error.status).toBe(503);
    expect(error.requestId).toBe('req_1');
  });
});
