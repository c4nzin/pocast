import { Injectable, OnModuleDestroy } from '@nestjs/common';
import ipaddr from 'ipaddr.js';
import { Agent, Dispatcher, request } from 'undici';
import {
  hostToAddress,
  isPublicAddress,
  publicOnlyLookup,
} from './network-guard';

export const FEED_FETCH_TIMEOUT_MS = 15_000;
export const FEED_MAX_BYTES = 15 * 1024 * 1024;
export const FEED_MAX_REDIRECTS = 5;
export const FEED_USER_AGENT = 'PocastBot/1.0 (+https://pocast.app/bot)';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

export interface ConditionalHeaders {
  readonly etag: string | null;
  readonly lastModified: string | null;
}

export type FeedFetchResult =
  | { readonly kind: 'not-modified' }
  | {
      readonly kind: 'fetched';
      readonly body: string;
      readonly etag: string | null;
      readonly lastModified: string | null;
      readonly finalUrl: string;
      readonly movedPermanently: boolean;
    };

export class FeedFetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly gone = false,
  ) {
    super(message);
    this.name = 'FeedFetchError';
  }
}

export abstract class FeedFetcher {
  abstract fetch(
    url: string,
    conditional: ConditionalHeaders,
  ): Promise<FeedFetchResult>;
}

export interface HttpFeedFetcherOptions {
  readonly allowPrivateNetworks?: boolean;
  readonly maxBytes?: number;
  readonly timeoutMs?: number;
}

function charsetOf(contentType: string | undefined, head: string): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const fromXml = /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1];
  return (fromHeader ?? fromXml ?? 'utf-8').toLowerCase();
}

function decode(bytes: Buffer, contentType: string | undefined): string {
  const charset = charsetOf(
    contentType,
    bytes.subarray(0, 200).toString('latin1'),
  );
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

function header(value: string | string[] | undefined): string | null {
  return (Array.isArray(value) ? value[0] : value) ?? null;
}

@Injectable()
export class HttpFeedFetcher extends FeedFetcher implements OnModuleDestroy {
  private readonly agent: Agent;
  private readonly allowPrivate: boolean;
  private readonly maxBytes: number;
  private readonly timeoutMs: number;

  constructor(options: HttpFeedFetcherOptions = {}) {
    super();
    this.allowPrivate = options.allowPrivateNetworks ?? false;
    this.maxBytes = options.maxBytes ?? FEED_MAX_BYTES;
    this.timeoutMs = options.timeoutMs ?? FEED_FETCH_TIMEOUT_MS;
    this.agent = new Agent({
      headersTimeout: this.timeoutMs,
      bodyTimeout: this.timeoutMs,
      connect: this.allowPrivate
        ? { timeout: this.timeoutMs }
        : { timeout: this.timeoutMs, lookup: publicOnlyLookup },
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.agent.close();
  }

  async fetch(
    url: string,
    conditional: ConditionalHeaders,
  ): Promise<FeedFetchResult> {
    const signal = AbortSignal.timeout(this.timeoutMs * 2);
    let current = url;
    let movedPermanently = false;

    for (let hop = 0; hop <= FEED_MAX_REDIRECTS; hop += 1) {
      this.assertAllowedUrl(current);
      const response = await this.send(current, conditional, signal);

      if (REDIRECT_STATUSES.has(response.statusCode)) {
        await response.body.dump();
        const location = header(response.headers['location']);
        if (!location) {
          throw new FeedFetchError('Redirect without Location header', false);
        }
        movedPermanently =
          (hop === 0 || movedPermanently) &&
          (response.statusCode === 301 || response.statusCode === 308);
        current = new URL(location, current).toString();
        continue;
      }
      return this.handleFinal(response, current, movedPermanently);
    }
    throw new FeedFetchError('Too many redirects', false);
  }

  private assertAllowedUrl(raw: string): void {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new FeedFetchError(`Unsupported protocol ${url.protocol}`, false);
    }
    const address = hostToAddress(url.hostname);
    if (
      !this.allowPrivate &&
      ipaddr.isValid(address) &&
      !isPublicAddress(address)
    ) {
      throw new FeedFetchError('Refusing to fetch a non-public address', false);
    }
  }

  private async send(
    url: string,
    conditional: ConditionalHeaders,
    signal: AbortSignal,
  ): Promise<Dispatcher.ResponseData> {
    const headers: Record<string, string> = {
      'user-agent': FEED_USER_AGENT,
      accept:
        'application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    };
    if (conditional.etag) headers['if-none-match'] = conditional.etag;
    if (conditional.lastModified)
      headers['if-modified-since'] = conditional.lastModified;

    try {
      return await request(url, { dispatcher: this.agent, headers, signal });
    } catch (error: unknown) {
      const code = (error as { code?: string }).code;
      if (code === 'EPRIVATEADDRESS') {
        throw new FeedFetchError(
          'Refusing to fetch a non-public address',
          false,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new FeedFetchError(`Network error: ${message}`, true);
    }
  }

  private async handleFinal(
    response: Dispatcher.ResponseData,
    finalUrl: string,
    movedPermanently: boolean,
  ): Promise<FeedFetchResult> {
    const { statusCode } = response;
    if (statusCode === 304) {
      await response.body.dump();
      return { kind: 'not-modified' };
    }
    if (statusCode < 200 || statusCode >= 300) {
      await response.body.dump();
      throw new FeedFetchError(
        `HTTP ${statusCode}`,
        RETRYABLE_STATUSES.has(statusCode),
        statusCode === 404 || statusCode === 410,
      );
    }
    const body = await this.readLimited(response);
    return {
      kind: 'fetched',
      body: decode(body, header(response.headers['content-type']) ?? undefined),
      etag: header(response.headers['etag']),
      lastModified: header(response.headers['last-modified']),
      finalUrl,
      movedPermanently,
    };
  }

  private async readLimited(
    response: Dispatcher.ResponseData,
  ): Promise<Buffer> {
    const declared = Number(header(response.headers['content-length']));
    if (Number.isFinite(declared) && declared > this.maxBytes) {
      await response.body.dump();
      throw new FeedFetchError(`Feed too large (${declared} bytes)`, false);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += (chunk as Buffer).length;
      if (total > this.maxBytes) {
        response.body.destroy();
        throw new FeedFetchError(`Feed exceeds ${this.maxBytes} bytes`, false);
      }
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  }
}
