import { Test } from '@nestjs/testing';
import { CATALOG_PATTERNS, CATALOG_SERVICE } from '@pocast/contracts';
import { of } from 'rxjs';
import { AuthGuard } from '../auth/auth.guard';
import { PodcastsController } from './podcasts.controller';

describe('PodcastsController', () => {
  const id = '01a11507-b466-760b-a242-ab2e961fd6a4';
  const client = { send: jest.fn() };
  let controller: PodcastsController;

  beforeEach(async () => {
    client.send.mockReset();
    const moduleRef = await Test.createTestingModule({
      controllers: [PodcastsController],
      providers: [{ provide: CATALOG_SERVICE, useValue: client }],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = moduleRef.get(PodcastsController);
  });

  it('forwards list queries', async () => {
    const page = { items: [], nextCursor: null };
    client.send.mockReturnValue(of(page));

    await expect(
      controller.list({ language: 'en', limit: 10 }),
    ).resolves.toEqual(page);
    expect(client.send).toHaveBeenCalledWith(CATALOG_PATTERNS.LIST_PODCASTS, {
      language: 'en',
      limit: 10,
    });
  });

  it('forwards get by id', async () => {
    client.send.mockReturnValue(of({ id }));

    await expect(controller.get(id)).resolves.toEqual({ id });
    expect(client.send).toHaveBeenCalledWith(CATALOG_PATTERNS.GET_PODCAST, id);
  });

  it('merges the path id into the episode query', async () => {
    client.send.mockReturnValue(of({ items: [], nextCursor: null }));

    await controller.listEpisodes(id, { cursor: 'abc', limit: 5 });

    expect(client.send).toHaveBeenCalledWith(CATALOG_PATTERNS.LIST_EPISODES, {
      cursor: 'abc',
      limit: 5,
      podcastId: id,
    });
  });

  it('forwards feed imports', async () => {
    client.send.mockReturnValue(of({ id }));

    await controller.import({ feedUrl: 'https://example.com/feed.xml' });

    expect(client.send).toHaveBeenCalledWith(CATALOG_PATTERNS.IMPORT_FEED, {
      feedUrl: 'https://example.com/feed.xml',
    });
  });
});
