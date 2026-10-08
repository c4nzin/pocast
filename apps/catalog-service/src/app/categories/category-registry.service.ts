import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CATEGORIES } from '@pocast/contracts';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CategoryRegistry implements OnModuleInit {
  private readonly logger = new Logger(CategoryRegistry.name);
  private idsBySlug: ReadonlyMap<string, number> = new Map();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.category.createMany({
      data: CATEGORIES.filter((c) => c.parentSlug === null).map((c) => ({
        slug: c.slug,
      })),
      skipDuplicates: true,
    });
    const parents = await this.prisma.category.findMany({
      where: { parentId: null },
      select: { id: true, slug: true },
    });
    const parentIds = new Map(parents.map((p) => [p.slug, p.id]));
    await this.prisma.category.createMany({
      data: CATEGORIES.filter((c) => c.parentSlug !== null).map((c) => ({
        slug: c.slug,
        parentId: parentIds.get(c.parentSlug as string) ?? null,
      })),
      skipDuplicates: true,
    });

    const all = await this.prisma.category.findMany({
      select: { id: true, slug: true },
    });
    this.idsBySlug = new Map(all.map((c) => [c.slug, c.id]));
    this.logger.log(`Category taxonomy ready (${all.length} categories)`);
  }

  idsFor(slugs: readonly string[]): number[] {
    return slugs
      .map((slug) => this.idsBySlug.get(slug))
      .filter((id): id is number => id !== undefined);
  }

  idFor(slug: string): number | null {
    return this.idsBySlug.get(slug) ?? null;
  }
}
