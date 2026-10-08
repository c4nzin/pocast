import {
  FeedParseError,
  MAX_EPISODES_PER_FEED,
  parseFeed,
} from './feed-parser';
import {
  normalizeLanguage,
  parseDuration,
  parseExplicit,
  parseSizeBytes,
} from './feed-values';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:podcast="https://podcastindex.org/namespace/1.0"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>Deep &amp; Wide</title>
    <link>https://deepwide.example</link>
    <language>en-US</language>
    <podcast:guid>c5f9a1e2-1111-5222-8333-444455556666</podcast:guid>
    <description><![CDATA[<p>A show about <b>everything</b>.</p>]]></description>
    <itunes:author>Jane Host</itunes:author>
    <itunes:explicit>yes</itunes:explicit>
    <itunes:image href="https://cdn.example/cover.jpg"/>
    <itunes:owner><itunes:name>Jane</itunes:name><itunes:email>Jane@Example.com</itunes:email></itunes:owner>
    <itunes:category text="Society &amp; Culture">
      <itunes:category text="Documentary"/>
    </itunes:category>
    <itunes:category text="Made Up Category"/>
    <item>
      <title>Older episode</title>
      <guid isPermaLink="false">ep-1</guid>
      <pubDate>Mon, 05 Oct 2026 08:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example/1.mp3" length="12345678" type="audio/mpeg"/>
      <itunes:duration>01:02:03</itunes:duration>
      <itunes:season>2</itunes:season>
      <itunes:episode>7</itunes:episode>
    </item>
    <item>
      <title>Newest episode</title>
      <pubDate>Tue, 06 Oct 2026 08:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example/2.mp4" type="video/mp4"/>
      <itunes:episodeType>trailer</itunes:episodeType>
      <content:encoded><![CDATA[Rich <i>notes</i>]]></content:encoded>
      <description>Plain notes</description>
    </item>
    <item>
      <title>Duplicate guid is dropped</title>
      <guid>ep-1</guid>
      <pubDate>Sun, 04 Oct 2026 08:00:00 GMT</pubDate>
      <enclosure url="https://cdn.example/dup.mp3" type="audio/mpeg"/>
    </item>
    <item>
      <title>No media, skipped</title>
      <guid>ep-x</guid>
    </item>
    <item>
      <title>Bad date</title>
      <guid>ep-bad-date</guid>
      <pubDate>not a date</pubDate>
      <enclosure url="javascript:alert(1)" type="audio/mpeg"/>
    </item>
  </channel>
</rss>`;

describe('parseFeed', () => {
  const feed = parseFeed(FEED);

  it('parses channel metadata with both namespaces', () => {
    expect(feed).toMatchObject({
      guid: 'c5f9a1e2-1111-5222-8333-444455556666',
      title: 'Deep & Wide',
      author: 'Jane Host',
      description: '<p>A show about <b>everything</b>.</p>',
      imageUrl: 'https://cdn.example/cover.jpg',
      websiteUrl: 'https://deepwide.example/',
      language: 'en-us',
      explicit: true,
      ownerName: 'Jane',
      ownerEmail: 'jane@example.com',
    });
  });

  it('keeps only known categories, including nested ones', () => {
    expect(feed.categories).toEqual(['society-culture', 'documentary']);
  });

  it('keeps playable, unique episodes newest first', () => {
    expect(feed.episodes.map((e) => e.guid)).toEqual([
      'https://cdn.example/2.mp4',
      'ep-1',
    ]);
  });

  it('maps episode fields', () => {
    const [newest, older] = feed.episodes;
    expect(older).toMatchObject({
      title: 'Older episode',
      durationSeconds: 3723,
      season: 2,
      episodeNumber: 7,
      episodeType: 'FULL',
      mediaUrl: 'https://cdn.example/1.mp3',
      mediaMimeType: 'audio/mpeg',
      mediaSizeBytes: 12345678n,
      mediaType: 'AUDIO',
    });
    expect(older.publishedAt?.toISOString()).toBe('2026-10-05T08:00:00.000Z');
    expect(newest).toMatchObject({
      episodeType: 'TRAILER',
      mediaType: 'VIDEO',
      description: 'Rich <i>notes</i>',
      mediaSizeBytes: null,
    });
  });

  it('caps the number of episodes', () => {
    const items = Array.from(
      { length: MAX_EPISODES_PER_FEED + 10 },
      (_, i) =>
        `<item><title>E${i}</title><guid>g${i}</guid><enclosure url="https://cdn.example/${i}.mp3"/></item>`,
    ).join('');
    const big = parseFeed(
      `<rss><channel><title>Big</title>${items}</channel></rss>`,
    );
    expect(big.episodes).toHaveLength(MAX_EPISODES_PER_FEED);
  });

  it.each([
    ['not xml at all <<<', 'Invalid XML'],
    ['<html><body>hi</body></html>', 'Not an RSS feed'],
    ['<rss><channel></channel></rss>', 'no title'],
  ])('rejects invalid feeds: %s', (xml, message) => {
    expect(() => parseFeed(xml)).toThrow(FeedParseError);
    expect(() => parseFeed(xml)).toThrow(message);
  });
});

describe('feed value normalizers', () => {
  it.each([
    ['01:02:03', 3723],
    ['62:03', 3723],
    ['3723', 3723],
    ['3723.4', 3723],
    ['', null],
    ['abc', null],
    ['-5', null],
    ['1:2:3:4', null],
    ['999999999', null],
  ])('parseDuration(%p) = %p', (raw, expected) => {
    expect(parseDuration(raw)).toBe(expected);
  });

  it.each([
    ['yes', true],
    ['True', true],
    ['explicit', true],
    ['no', false],
    ['clean', false],
  ])('parseExplicit(%p) = %p', (raw, expected) => {
    expect(parseExplicit(raw)).toBe(expected);
  });

  it.each([
    ['en-US', 'en-us'],
    ['pt_BR', 'pt-br'],
    ['tr', 'tr'],
    ['English', null],
    ['', null],
  ])('normalizeLanguage(%p) = %p', (raw, expected) => {
    expect(normalizeLanguage(raw)).toBe(expected);
  });

  it('rejects absurd or malformed sizes', () => {
    expect(parseSizeBytes('0')).toBeNull();
    expect(parseSizeBytes('12.5')).toBeNull();
    expect(parseSizeBytes('9'.repeat(20))).toBeNull();
    expect(parseSizeBytes('1024')).toBe(1024n);
  });
});
