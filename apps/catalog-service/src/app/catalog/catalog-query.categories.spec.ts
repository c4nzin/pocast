import { CATEGORIES, CATEGORY_CACHE_TTL_MS } from '@pocast/contracts';
import { CategoryRegistry } from '../categories/category-registry.service';
import { PrismaService } from '../prisma/prisma.service';
import { CatalogQueryService } from './catalog-query.service';

const idsBySlug = new Map(CATEGORIES.map((c, index) => [c.slug, index + 1]));

describe('CatalogQueryService.listCategories', () => {
  const groupBy = jest.fn();
  let service: CatalogQueryService;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    groupBy.mockReset();
    groupBy.mockResolvedValue([]);
    const prisma = {
      podcastCategory: { groupBy },
    } as unknown as PrismaService;
    const registry = {
      idFor: (slug: string) => idsBySlug.get(slug) ?? null,
    } as unknown as CategoryRegistry;
    service = new CatalogQueryService(prisma, registry);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('builds a tree with only top-level categories at the root', async () => {
    const tree = await service.listCategories();

    const topLevel = CATEGORIES.filter((c) => c.parentSlug === null);
    expect(tree).toHaveLength(topLevel.length);
    const arts = tree.find((node) => node.slug === 'arts');
    expect(arts?.children.map((c) => c.slug)).toContain('books');
    expect(tree.find((node) => node.slug === 'books')).toBeUndefined();
  });

  it('sorts roots and children alphabetically by name', async () => {
    const tree = await service.listCategories();

    const names = tree.map((node) => node.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    const childNames = tree[0].children.map((c) => c.name);
    expect(childNames).toEqual(
      [...childNames].sort((a, b) => a.localeCompare(b)),
    );
  });

  it('maps podcast counts onto categories and defaults missing ones to 0', async () => {
    groupBy.mockResolvedValue([
      { categoryId: idsBySlug.get('arts'), _count: 12 },
      { categoryId: idsBySlug.get('books'), _count: 5 },
    ]);

    const tree = await service.listCategories();

    const arts = tree.find((node) => node.slug === 'arts');
    expect(arts?.podcastCount).toBe(12);
    expect(arts?.children.find((c) => c.slug === 'books')?.podcastCount).toBe(
      5,
    );
    expect(arts?.children.find((c) => c.slug === 'design')?.podcastCount).toBe(
      0,
    );
  });

  it('counts only active podcasts', async () => {
    await service.listCategories();

    expect(groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { podcast: { status: 'ACTIVE' } },
      }),
    );
  });

  it('serves repeated calls from cache with a single query', async () => {
    await service.listCategories();
    await service.listCategories();
    await service.listCategories();

    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('shares one query between concurrent calls on a cold cache', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => service.listCategories()),
    );

    expect(groupBy).toHaveBeenCalledTimes(1);
  });

  it('queries again once the cache has expired', async () => {
    await service.listCategories();

    jest.setSystemTime(Date.now() + CATEGORY_CACHE_TTL_MS + 1);
    await service.listCategories();

    expect(groupBy).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed query and allows a retry', async () => {
    groupBy.mockRejectedValueOnce(new Error('db down'));

    await expect(service.listCategories()).rejects.toThrow('db down');
    await expect(service.listCategories()).resolves.toBeDefined();

    expect(groupBy).toHaveBeenCalledTimes(2);
  });
});
