import { HttpException, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { CATALOG_PATTERNS } from '@pocast/contracts';
import { of, throwError } from 'rxjs';
import { PodcastsController } from './podcasts.controller';

const PODCAST_ID = '0191a000-0000-7000-8000-000000000001';
const EPISODE_ID = '0191a000-0000-7000-8000-000000000002';

describe('PodcastsController.getEpisode', () => {
  const send = jest.fn();
  let controller: PodcastsController;

  beforeEach(() => {
    send.mockReset();
    controller = new PodcastsController({ send } as unknown as ClientProxy);
  });

  it('forwards both ids to the catalog service and returns its answer', async () => {
    const episode = { id: EPISODE_ID, podcastId: PODCAST_ID };
    send.mockReturnValue(of(episode));

    const result = await controller.getEpisode(PODCAST_ID, EPISODE_ID);

    expect(send).toHaveBeenCalledWith(CATALOG_PATTERNS.GET_EPISODE, {
      podcastId: PODCAST_ID,
      episodeId: EPISODE_ID,
    });
    expect(result).toBe(episode);
  });

  it('maps a catalog 404 to an HTTP 404', async () => {
    send.mockReturnValue(
      throwError(() => ({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Episode not found',
      })),
    );

    const call = controller.getEpisode(PODCAST_ID, EPISODE_ID);

    await expect(call).rejects.toBeInstanceOf(HttpException);
    await expect(call).rejects.toMatchObject({ status: HttpStatus.NOT_FOUND });
  });
});

describe('ParseUUIDPipe on episode route params', () => {
  const pipe = new ParseUUIDPipe();

  it('rejects a non-UUID value with 400', async () => {
    await expect(
      pipe.transform('xyz', { type: 'param', data: 'episodeId' }),
    ).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
  });

  it('accepts a valid UUID', async () => {
    await expect(
      pipe.transform(EPISODE_ID, { type: 'param', data: 'episodeId' }),
    ).resolves.toBe(EPISODE_ID);
  });
});
