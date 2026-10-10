import { Module } from '@nestjs/common';
import { PodcastsModule } from '../podcasts/podcasts.module';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [PodcastsModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
