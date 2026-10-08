import { defineConfig } from 'prisma/config';

const url =
  process.env['PRISMA_TARGET'] === 'test'
    ? process.env['CATALOG_TEST_DATABASE_URL']
    : process.env['CATALOG_DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
