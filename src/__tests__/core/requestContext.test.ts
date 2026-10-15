import { requestIdMiddleware } from '@core/middlewares/requestId';
import { requestContext } from '@core/utils/requestContext';

describe('requestIdMiddleware', () => {
  it('binds request + client context to AsyncLocalStorage', (done) => {
    const headers: Record<string, string> = {
      'x-device-id': 'dev-123',
      'x-app-version': '1.0.0',
      'x-device-os': 'iOS 17',
    };
    const req = {
      headers,
      ip: '1.2.3.4',
      get: (h: string) => headers[h.toLowerCase()],
    };
    const res = { setHeader: jest.fn() };
    const next = () => {
      const ctx = requestContext.getStore();
      expect(ctx?.ip).toBe('1.2.3.4');
      expect(ctx?.deviceId).toBe('dev-123');
      expect(ctx?.appVersion).toBe('1.0.0');
      expect(ctx?.deviceOs).toBe('iOS 17');
      expect(ctx?.requestId).toBeDefined();
      done();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestIdMiddleware(req as any, res as any, next);
  });

  it('honors an incoming X-Request-Id', (done) => {
    const req = { headers: { 'x-request-id': 'trace-42' }, ip: '10.0.0.1', get: () => undefined };
    const res = { setHeader: jest.fn() };
    const next = () => {
      expect(requestContext.getStore()?.requestId).toBe('trace-42');
      done();
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requestIdMiddleware(req as any, res as any, next);
  });
});
