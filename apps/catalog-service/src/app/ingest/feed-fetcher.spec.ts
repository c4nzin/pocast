import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';
import { AddressInfo } from 'node:net';
import { FeedFetchError, HttpFeedFetcher } from './feed-fetcher';
import { isPublicAddress } from './network-guard';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const NO_CONDITIONAL = { etag: null, lastModified: null };
const FEED =
  '<?xml version="1.0"?><rss><channel><title>T</title></channel></rss>';

describe('isPublicAddress', () => {
  it.each([
    ['8.8.8.8', true],
    ['2606:4700:4700::1111', true],
    ['127.0.0.1', false],
    ['10.1.2.3', false],
    ['172.16.0.1', false],
    ['192.168.1.1', false],
    ['169.254.169.254', false],
    ['100.64.0.1', false],
    ['::1', false],
    ['fd00::1', false],
    ['::ffff:127.0.0.1', false],
    ['not-an-ip', false],
  ])('%s -> %s', (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe('HttpFeedFetcher', () => {
  let server: Server;
  let baseUrl: string;
  let handler: Handler;
  let fetcher: HttpFeedFetcher;

  beforeAll(async () => {
    server = createServer((req, res) => handler(req, res));
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    fetcher = new HttpFeedFetcher({
      allowPrivateNetworks: true,
      maxBytes: 1024,
      timeoutMs: 2000,
    });
  });

  afterAll(async () => {
    await fetcher.onModuleDestroy();
    await new Promise((resolve) => server.close(resolve));
  });

  it('blocks private addresses by default (SSRF)', async () => {
    const strict = new HttpFeedFetcher();
    handler = (_req, res) => res.end(FEED);

    await expect(
      strict.fetch(`${baseUrl}/feed`, NO_CONDITIONAL),
    ).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('non-public'),
    });
    await expect(
      strict.fetch('http://localhost:1/feed', NO_CONDITIONAL),
    ).rejects.toBeInstanceOf(FeedFetchError);
    await strict.onModuleDestroy();
  });

  it('rejects non-http protocols', async () => {
    await expect(
      fetcher.fetch('file:///etc/passwd', NO_CONDITIONAL),
    ).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('returns the body with caching validators', async () => {
    handler = (_req, res) => {
      res.setHeader('etag', '"v1"');
      res.setHeader('last-modified', 'Tue, 06 Oct 2026 10:00:00 GMT');
      res.end(FEED);
    };

    const result = await fetcher.fetch(`${baseUrl}/feed`, NO_CONDITIONAL);

    expect(result).toMatchObject({
      kind: 'fetched',
      body: FEED,
      etag: '"v1"',
      lastModified: 'Tue, 06 Oct 2026 10:00:00 GMT',
    });
  });

  it('sends conditional headers and understands 304', async () => {
    let seen: IncomingMessage['headers'] = {};
    handler = (req, res) => {
      seen = req.headers;
      res.statusCode = 304;
      res.end();
    };

    const result = await fetcher.fetch(`${baseUrl}/feed`, {
      etag: '"v1"',
      lastModified: 'Tue, 06 Oct 2026 10:00:00 GMT',
    });

    expect(result).toEqual({ kind: 'not-modified' });
    expect(seen['if-none-match']).toBe('"v1"');
    expect(seen['if-modified-since']).toBe('Tue, 06 Oct 2026 10:00:00 GMT');
  });

  it('follows redirects and reports permanent moves', async () => {
    handler = (req, res) => {
      if (req.url === '/old') {
        res.statusCode = 301;
        res.setHeader('location', '/new');
        res.end();
        return;
      }
      res.end(FEED);
    };

    const result = await fetcher.fetch(`${baseUrl}/old`, NO_CONDITIONAL);

    expect(result).toMatchObject({
      kind: 'fetched',
      finalUrl: `${baseUrl}/new`,
      movedPermanently: true,
    });
  });

  it('aborts feeds larger than the limit while streaming', async () => {
    handler = (_req, res) => {
      res.write('x'.repeat(800));
      res.end('x'.repeat(800));
    };

    await expect(
      fetcher.fetch(`${baseUrl}/big`, NO_CONDITIONAL),
    ).rejects.toMatchObject({
      retryable: false,
      message: expect.stringContaining('exceeds'),
    });
  });

  it.each([
    [404, false, true],
    [410, false, true],
    [503, true, false],
    [429, true, false],
    [403, false, false],
  ])(
    'classifies HTTP %i (retryable=%s, gone=%s)',
    async (status, retryable, gone) => {
      handler = (_req, res) => {
        res.statusCode = status;
        res.end();
      };

      await expect(
        fetcher.fetch(`${baseUrl}/x`, NO_CONDITIONAL),
      ).rejects.toMatchObject({
        retryable,
        gone,
      });
    },
  );

  it('decodes non-UTF-8 feeds using the declared charset', async () => {
    handler = (_req, res) => {
      res.setHeader('content-type', 'application/rss+xml; charset=iso-8859-1');
      res.end(Buffer.from('<title>Caf\xe9</title>', 'latin1'));
    };

    const result = await fetcher.fetch(`${baseUrl}/latin`, NO_CONDITIONAL);

    expect(result).toMatchObject({ body: '<title>Café</title>' });
  });
});
