import { ClientProxy } from '@nestjs/microservices';
import { CategoryRegistry } from '../categories/category-registry.service';
import {
  ConditionalHeaders,
  FeedFetcher,
  FeedFetchError,
  FeedFetchResult,
} from '../ingest/feed-fetcher';
import { FeedIngestService } from '../ingest/feed-ingest.service';
import { PrismaService } from '../prisma/prisma.service';
import { FeedScheduler } from '../scheduler/feed-scheduler.service';
import { CatalogQueryService } from './catalog-query.service';

const testDatabaseUrl = process.env['CATALOG_TEST_DATABASE_URL'];
const describeDb = testDatabaseUrl ? describe : describe.skip;
if (testDatabaseUrl) {
  process.env['CATALOG_DATABASE_URL'] = testDatabaseUrl;
}

interface EpisodeSpec {
  guid: string;
  title?: string;
  date: string;
}

function feedXml(title: string, episodes: EpisodeSpec[], extra = ''): string {
  const items = episodes
    .map(
      (e) => `<item><title>${e.title ?? e.guid}</title><guid>${e.guid}</guid>
        <pubDate>${new Date(e.date).toUTCString()}</pubDate>
        <enclosure url="https://cdn.example/${e.guid}.mp3" type="audio/mpeg"/></item>`,
    )
    .join('');
  return `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
    <title>${title}</title><language>en-US</language>${extra}${items}</channel></rss>`;
}

class FakeFetcher extends FeedFetcher {
  readonly responses = new Map<string, () => FeedFetchResult>();
  readonly calls: { url: string; conditional: ConditionalHeaders }[] = [];

  serve(url: string, body: string, etag: string | null = null): void {
    this.responses.set(url, () => ({
      kind: 'fetched',
      body,
      etag,
      lastModified: null,
      finalUrl: url,
      movedPermanently: false,
    }));
  }

  async fetch(
    url: string,
    conditional: ConditionalHeaders,
  ): Promise<FeedFetchResult> {
    this.calls.push({ url, conditional });
    const respond = this.responses.get(url);
    if (!respond) throw new FeedFetchError('HTTP 404', false, true);
    return respond();
  }
}

describeDb('catalog ingest + queries (integration)', () => {
  let prisma: PrismaService;
  let fetcher: FakeFetcher;
  let ingest: FeedIngestService;
  let queries: CatalogQueryService;
  let scheduler: FeedScheduler;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    const categories = new CategoryRegistry(prisma);
    await categories.onModuleInit();
    fetcher = new FakeFetcher();
    ingest = new FeedIngestService(prisma, fetcher, categories);
    queries = new CatalogQueryService(prisma, categories);
    scheduler = new FeedScheduler(prisma, {} as ClientProxy);
  });

  beforeEach(async () => {
    await prisma.podcast.deleteMany();
    fetcher.responses.clear();
    fetcher.calls.length = 0;
  });

  afterAll(async () => {
    await prisma.podcast.deleteMany();
    await prisma.onModuleDestroy();
  });

  describe('importFeed', () => {
    const url = 'https://feeds.example/show.xml';

    it('creates the podcast with episodes and known categories', async () => {
      fetcher.serve(
        url,
        feedXml(
          'Show',
          [
            { guid: 'a', date: '2026-10-01' },
            { guid: 'b', date: '2026-10-05' },
          ],
          '<itunes:category text="Technology"/><itunes:category text="Nope"/>',
        ),
      );

      const id = await ingest.importFeed(url);
      const detail = await queries.getPodcast(id);

      expect(detail).toMatchObject({
        source: 'RSS',
        title: 'Show',
        language: 'en-us',
        episodeCount: 2,
        latestEpisodeAt: '2026-10-05T00:00:00.000Z',
        categories: ['technology'],
      });
    });

    it('is idempotent across equivalent URLs', async () => {
      fetcher.serve(url, feedXml('Show', [{ guid: 'a', date: '2026-10-01' }]));

      const first = await ingest.importFeed(url);
      const second = await ingest.importFeed(
        'HTTPS://FEEDS.example:443/show.xml#top',
      );

      expect(second).toBe(first);
      expect(fetcher.calls).toHaveLength(1);
    });

    it('survives concurrent imports of the same feed', async () => {
      fetcher.serve(url, feedXml('Show', [{ guid: 'a', date: '2026-10-01' }]));

      const ids = await Promise.all([
        ingest.importFeed(url),
        ingest.importFeed(url),
      ]);

      expect(ids[0]).toBe(ids[1]);
      await expect(prisma.podcast.count()).resolves.toBe(1);
    });

    it('surfaces unusable feeds as errors', async () => {
      await expect(
        ingest.importFeed('https://feeds.example/missing.xml'),
      ).rejects.toBeInstanceOf(FeedFetchError);
    });
  });

  describe('refreshFeed', () => {
    const url = 'https://feeds.example/live.xml';

    async function importLive(): Promise<string> {
      fetcher.serve(
        url,
        feedXml('Live', [{ guid: 'a', date: '2026-10-01' }]),
        '"v1"',
      );
      return ingest.importFeed(url);
    }

    it('sends validators and treats 304 as unchanged', async () => {
      const id = await importLive();
      fetcher.responses.set(url, () => ({ kind: 'not-modified' }));

      await expect(ingest.refreshFeed(id)).resolves.toBe('unchanged');
      expect(fetcher.calls.at(-1)?.conditional.etag).toBe('"v1"');
    });

    it('skips parsing when the body hash is unchanged', async () => {
      const id = await importLive();

      await expect(ingest.refreshFeed(id)).resolves.toBe('unchanged');
    });

    it('adds new episodes and refreshes recent ones', async () => {
      const id = await importLive();
      fetcher.serve(
        url,
        feedXml('Live (renamed)', [
          { guid: 'a', title: 'A edited', date: '2026-10-01' },
          { guid: 'c', date: '2026-10-06' },
        ]),
      );

      await expect(ingest.refreshFeed(id)).resolves.toBe('updated');
      const detail = await queries.getPodcast(id);
      const episodes = await queries.listEpisodes({ podcastId: id });
      expect(detail.title).toBe('Live (renamed)');
      expect(detail.episodeCount).toBe(2);
      expect(episodes.items.map((e) => e.title)).toEqual(['c', 'A edited']);
    });

    it('backs off on failure, hides gone feeds, and recovers', async () => {
      const id = await importLive();
      fetcher.responses.delete(url);

      await expect(ingest.refreshFeed(id)).resolves.toBe('failed');
      const failed = await prisma.podcast.findUniqueOrThrow({ where: { id } });
      expect(failed).toMatchObject({ consecutiveErrors: 1, status: 'HIDDEN' });
      expect(failed.nextFetchAt!.getTime()).toBeGreaterThan(Date.now());

      fetcher.serve(url, feedXml('Live', [{ guid: 'z', date: '2026-10-07' }]));
      await expect(ingest.refreshFeed(id)).resolves.toBe('updated');
      const recovered = await prisma.podcast.findUniqueOrThrow({
        where: { id },
      });
      expect(recovered).toMatchObject({
        consecutiveErrors: 0,
        status: 'ACTIVE',
        lastError: null,
      });
    });

    it('never touches blocked podcasts', async () => {
      const id = await importLive();
      await prisma.podcast.update({
        where: { id },
        data: { status: 'BLOCKED' },
      });

      await expect(ingest.refreshFeed(id)).resolves.toBe('skipped');
    });
  });

  describe('listPodcasts', () => {
    async function seed(
      title: string,
      date: string,
      extra = '',
    ): Promise<string> {
      const url = `https://feeds.example/${title}.xml`;
      fetcher.serve(url, feedXml(title, [{ guid: `${title}-1`, date }], extra));
      return ingest.importFeed(url);
    }

    it('pages through recently updated podcasts with a cursor', async () => {
      await seed('old', '2026-01-01');
      await seed('mid', '2026-05-01');
      await seed('new', '2026-09-01');

      const first = await queries.listPodcasts({ limit: 2 });
      const second = await queries.listPodcasts({
        limit: 2,
        cursor: first.nextCursor!,
      });

      expect(first.items.map((p) => p.title)).toEqual(['new', 'mid']);
      expect(second.items.map((p) => p.title)).toEqual(['old']);
      expect(second.nextCursor).toBeNull();
    });

    it('filters by language and category', async () => {
      await seed('tech', '2026-05-01', '<itunes:category text="Technology"/>');
      await seed('news', '2026-05-02', '<itunes:category text="News"/>');

      const tech = await queries.listPodcasts({ category: 'technology' });
      const french = await queries.listPodcasts({ language: 'fr' });

      expect(tech.items.map((p) => p.title)).toEqual(['tech']);
      expect(french.items).toEqual([]);
    });

    it('rejects tampered cursors', async () => {
      await expect(
        queries.listPodcasts({ cursor: 'garbage' }),
      ).rejects.toMatchObject({
        error: { statusCode: 400 },
      });
    });
  });

  describe('listEpisodes', () => {
    it('pages newest first and 404s for unknown podcasts', async () => {
      const url = 'https://feeds.example/eps.xml';
      fetcher.serve(
        url,
        feedXml('Eps', [
          { guid: '1', date: '2026-10-01' },
          { guid: '2', date: '2026-10-02' },
          { guid: '3', date: '2026-10-03' },
        ]),
      );
      const id = await ingest.importFeed(url);

      const first = await queries.listEpisodes({ podcastId: id, limit: 2 });
      const second = await queries.listEpisodes({
        podcastId: id,
        limit: 2,
        cursor: first.nextCursor!,
      });

      expect([...first.items, ...second.items].map((e) => e.title)).toEqual([
        '3',
        '2',
        '1',
      ]);
      await expect(
        queries.listEpisodes({
          podcastId: '0199b000-0000-7000-8000-000000000000',
        }),
      ).rejects.toMatchObject({ error: { statusCode: 404 } });
    });
  });

  describe('scheduler claims', () => {
    it('claims only due feeds, and concurrent claimers never overlap', async () => {
      const ids: string[] = [];
      for (const name of ['d1', 'd2', 'd3', 'later']) {
        const url = `https://feeds.example/${name}.xml`;
        fetcher.serve(url, feedXml(name, [{ guid: name, date: '2026-10-01' }]));
        ids.push(await ingest.importFeed(url));
      }
      await prisma.podcast.updateMany({
        where: { id: { in: ids.slice(0, 3) } },
        data: { nextFetchAt: new Date(Date.now() - 60_000) },
      });

      const [a, b] = await Promise.all([
        scheduler.claimDueFeeds(2),
        scheduler.claimDueFeeds(2),
      ]);
      const claimed = [...a, ...b];

      expect(new Set(claimed).size).toBe(claimed.length);
      expect(new Set(claimed)).toEqual(new Set(ids.slice(0, 3)));
      await expect(scheduler.claimDueFeeds(10)).resolves.toEqual([]);
    });
  });
});
