import { BadRequestException } from '@nestjs/common';
import { CATEGORIES, type CreatorCategory } from '@pocast/contracts';

const BY_SLUG = new Map(
  CATEGORIES.map((category) => [category.slug, category]),
);

export function resolveCategory(slug: string): CreatorCategory {
  const category = BY_SLUG.get(slug);
  if (!category) {
    throw new BadRequestException('category must be a known category slug');
  }
  const parent = category.parentSlug ? BY_SLUG.get(category.parentSlug) : null;
  return {
    slug: category.slug,
    name: category.name,
    parentName: parent?.name ?? null,
  };
}
