import { defineConfig } from 'prisma/config';

const url =
  process.env['PRISMA_TARGET'] === 'test'
    ? process.env['AUTH_TEST_DATABASE_URL']
    : process.env['AUTH_DATABASE_URL'];

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: { url },
});
