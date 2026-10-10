import { Controller, Get, Header, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import {
  CATALOG_PATTERNS,
  CATALOG_SERVICE,
  CategoryNode,
} from '@pocast/contracts';
import { sendRpc } from '../common/send-rpc';

export const CATEGORIES_CACHE_CONTROL =
  'public, max-age=300, stale-while-revalidate=600';

@Controller('categories')
export class CategoriesController {
  constructor(
    @Inject(CATALOG_SERVICE) private readonly catalogClient: ClientProxy,
  ) {}

  @Get()
  @Header('Cache-Control', CATEGORIES_CACHE_CONTROL)
  getCategories(): Promise<CategoryNode[]> {
    return sendRpc(this.catalogClient, CATALOG_PATTERNS.LIST_CATEGORIES, {});
  }
}
