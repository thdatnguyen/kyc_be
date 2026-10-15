import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  requestId: string;
  userId?: string;
  role?: string;
  // Client/network context for tracing (see requestContextMiddleware).
  ip?: string;
  userAgent?: string;
  appVersion?: string;
  deviceId?: string;
  deviceOs?: string;
}

// Carries per-request context through the async call chain so any service can
// log with the requestId/userId without threading them as parameters.
export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}
