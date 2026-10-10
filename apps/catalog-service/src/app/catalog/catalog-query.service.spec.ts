import { HttpStatus } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { CategoryRegistry } from '../categories/category-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { EPISODE_SELECT } from './catalog-mappers';
import { CatalogQueryService } from './catalog-query.service';

const PODCAST_ID = '0191a000-0000-7000-8000-000000000001';
const EPISODE_ID = '0191a000-0000-7000-8000-000000000002';

const episodeRow = {
  id: EPISODE_ID,
  podcastId: PODCAST_ID,
  title: 'Pilot',
  description: null,
  imageUrl: null,
  publishedAt: new Date('2025-01-01T00:00:00Z'),
  durationSeconds: 60,
  season: null,
  episodeNumber: 1,
  episodeType: 'FULL',
  explicit: false,
  mediaUrl: 'https://cdn.example.com/pilot.mp3',
  mediaType: 'AUDIO',
  mediaMimeType: 'audio/mpeg',
  mediaSizeBytes: BigInt(1024),
};

describe('CatalogQueryService.getEpisode', () => {
  const findFirst = jest.fn();
  let service: CatalogQueryService;

  beforeEach(() => {
    findFirst.mockReset();
    const prisma = { episode: { findFirst } } as unknown as PrismaService;
    service = new CatalogQueryService(prisma, {} as CategoryRegistry);
  });

  it('returns the mapped episode when it belongs to an active podcast', async () => {
    findFirst.mockResolvedValue(episodeRow);

    const result = await service.getEpisode({
      podcastId: PODCAST_ID,
      episodeId: EPISODE_ID,
    });

    expect(result).toMatchObject({
      id: EPISODE_ID,
      podcastId: PODCAST_ID,
      title: 'Pilot',
    });
  });

  it('scopes the query by podcast and podcast status', async () => {
    findFirst.mockResolvedValue(episodeRow);

    await service.getEpisode({ podcastId: PODCAST_ID, episodeId: EPISODE_ID });

    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: EPISODE_ID,
        podcastId: PODCAST_ID,
        podcast: { status: 'ACTIVE' },
      },
      select: EPISODE_SELECT,
    });
  });

  it('throws a 404 RpcException when no episode matches', async () => {
    findFirst.mockResolvedValue(null);

    const call = service.getEpisode({
      podcastId: PODCAST_ID,
      episodeId: EPISODE_ID,
    });

    await expect(call).rejects.toBeInstanceOf(RpcException);
    await expect(call).rejects.toMatchObject({
      error: { statusCode: HttpStatus.NOT_FOUND },
    });
  });
});
