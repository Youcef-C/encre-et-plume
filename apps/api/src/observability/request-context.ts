import { AsyncLocalStorage } from 'node:async_hooks';

interface RequestStore {
  requestId: string;
  userId?: string;
}

/** F-9: per-request correlation id store via stdlib AsyncLocalStorage (no library). */
export const requestContext = new AsyncLocalStorage<RequestStore>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}

/** Called after auth resolves to enrich logs and Sentry captures with the real user id. */
export function setUserId(id: string): void {
  const store = requestContext.getStore();
  if (store) store.userId = id;
}
