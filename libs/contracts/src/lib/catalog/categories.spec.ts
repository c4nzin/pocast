import { CATEGORIES, CATEGORY_SLUGS, categorySlug } from './categories.js';

describe('categories', () => {
  it('slugifies names into stable, url-safe slugs', () => {
    expect(categorySlug('Society & Culture')).toBe('society-culture');
    expect(categorySlug('TV & Film')).toBe('tv-film');
    expect(categorySlug('Non-Profit')).toBe('non-profit');
  });

  it('has globally unique slugs (they are the database key)', () => {
    expect(new Set(CATEGORY_SLUGS).size).toBe(CATEGORY_SLUGS.length);
  });

  it('only references parents that exist', () => {
    const topLevel = new Set(
      CATEGORIES.filter((c) => c.parentSlug === null).map((c) => c.slug),
    );
    for (const category of CATEGORIES) {
      if (category.parentSlug !== null) {
        expect(topLevel.has(category.parentSlug)).toBe(true);
      }
    }
  });
});
