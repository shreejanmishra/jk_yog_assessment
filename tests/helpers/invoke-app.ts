import http from 'node:http';
import { Duplex } from 'node:stream';
import type express from 'express';

class MockSocket extends Duplex {
  public remoteAddress = '127.0.0.1';
  override _read(): void {}
  override _write(
    _chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    callback();
  }
}

export interface InvokeRequestOptions {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface InvokeResponse<T = unknown> {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
  body: T;
}

/**
 * Invokes an Express 5 app directly in memory using Node's IncomingMessage / ServerResponse
 * without binding a TCP port, allowing deterministic API & concurrency tests inside
 * network-restricted sandboxes and CI environments.
 */
export function invokeApp<T = Record<string, unknown>>(
  app: express.Express,
  options: InvokeRequestOptions,
): Promise<InvokeResponse<T>> {
  return new Promise((resolve, reject) => {
    const socket = new MockSocket();
    const req = new http.IncomingMessage(socket as unknown as import('node:net').Socket);
    req.method = options.method;
    req.url = options.path;

    const payloadBuf =
      options.body !== undefined
        ? Buffer.from(
            typeof options.body === 'string' ? options.body : JSON.stringify(options.body),
            'utf8',
          )
        : null;

    const normalizedHeaders: Record<string, string> = {};
    if (options.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        normalizedHeaders[k.toLowerCase()] = v;
      }
    }
    if (payloadBuf && !normalizedHeaders['content-type']) {
      normalizedHeaders['content-type'] = 'application/json';
    }
    if (payloadBuf) {
      normalizedHeaders['content-length'] = String(payloadBuf.byteLength);
    }
    req.headers = normalizedHeaders;

    const res = new http.ServerResponse(req);
    res.assignSocket(socket as unknown as import('node:net').Socket);

    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);

    res.write = ((chunk: unknown, encoding?: unknown, cb?: unknown): boolean => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8'),
        );
      }
      return origWrite(chunk as never, encoding as never, cb as never);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, encoding?: unknown, cb?: unknown): http.ServerResponse => {
      if (chunk && typeof chunk !== 'function') {
        chunks.push(
          Buffer.isBuffer(chunk)
            ? chunk
            : Buffer.from(String(chunk), typeof encoding === 'string' ? (encoding as BufferEncoding) : 'utf8'),
        );
      }
      const result = origEnd(chunk as never, encoding as never, cb as never);
      const rawBody = Buffer.concat(chunks);
      const resHeaders = res.getHeaders();
      const headerMap: Record<string, string | string[] | undefined> = {};
      for (const [k, v] of Object.entries(resHeaders)) {
        headerMap[k.toLowerCase()] = typeof v === 'number' ? String(v) : v;
      }

      const contentType = String(headerMap['content-type'] ?? '');
      let parsedBody: unknown = rawBody;
      if (contentType.includes('application/json') && rawBody.length > 0) {
        try {
          parsedBody = JSON.parse(rawBody.toString('utf8'));
        } catch {
          parsedBody = rawBody.toString('utf8');
        }
      }

      resolve({
        status: res.statusCode,
        headers: headerMap,
        rawBody,
        body: parsedBody as T,
      });
      return result;
    }) as typeof res.end;

    try {
      app(req, res);
      if (payloadBuf) {
        req.push(payloadBuf);
      }
      req.push(null);
    } catch (err) {
      reject(err);
    }
  });
}
