-- CreateEnum
CREATE TYPE "PodcastSource" AS ENUM ('RSS', 'HOSTED');

-- CreateEnum
CREATE TYPE "PodcastStatus" AS ENUM ('ACTIVE', 'HIDDEN', 'BLOCKED');

-- CreateEnum
CREATE TYPE "EpisodeType" AS ENUM ('FULL', 'TRAILER', 'BONUS');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('EXTERNAL_URL', 'HOSTED_ASSET');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('AUDIO', 'VIDEO');

-- CreateTable
CREATE TABLE "podcasts" (
    "id" UUID NOT NULL,
    "guid" TEXT,
    "source" "PodcastSource" NOT NULL,
    "status" "PodcastStatus" NOT NULL DEFAULT 'ACTIVE',
    "title" TEXT NOT NULL,
    "author" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "websiteUrl" TEXT,
    "language" VARCHAR(35),
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "ownerName" TEXT,
    "ownerEmail" TEXT,
    "feedUrl" TEXT,
    "feedEtag" TEXT,
    "feedLastModified" TEXT,
    "feedContentHash" TEXT,
    "lastFetchedAt" TIMESTAMP(3),
    "nextFetchAt" TIMESTAMP(3),
    "consecutiveErrors" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "episodeCount" INTEGER NOT NULL DEFAULT 0,
    "latestEpisodeAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "podcasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "episodes" (
    "id" UUID NOT NULL,
    "podcastId" UUID NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER,
    "season" INTEGER,
    "episodeNumber" INTEGER,
    "episodeType" "EpisodeType" NOT NULL DEFAULT 'FULL',
    "explicit" BOOLEAN NOT NULL DEFAULT false,
    "mediaKind" "MediaKind" NOT NULL,
    "mediaType" "MediaType" NOT NULL DEFAULT 'AUDIO',
    "mediaUrl" TEXT NOT NULL,
    "mediaMimeType" TEXT,
    "mediaSizeBytes" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "episodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "parentId" INTEGER,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "podcast_categories" (
    "podcastId" UUID NOT NULL,
    "categoryId" INTEGER NOT NULL,

    CONSTRAINT "podcast_categories_pkey" PRIMARY KEY ("podcastId","categoryId")
);

-- CreateIndex
CREATE UNIQUE INDEX "podcasts_guid_key" ON "podcasts"("guid");

-- CreateIndex
CREATE UNIQUE INDEX "podcasts_feedUrl_key" ON "podcasts"("feedUrl");

-- CreateIndex
CREATE INDEX "podcasts_status_latestEpisodeAt_id_idx" ON "podcasts"("status", "latestEpisodeAt" DESC, "id");

-- CreateIndex
CREATE INDEX "podcasts_language_status_latestEpisodeAt_idx" ON "podcasts"("language", "status", "latestEpisodeAt" DESC);

-- CreateIndex
CREATE INDEX "podcasts_nextFetchAt_idx" ON "podcasts"("nextFetchAt");

-- CreateIndex
CREATE INDEX "episodes_podcastId_publishedAt_id_idx" ON "episodes"("podcastId", "publishedAt" DESC, "id");

-- CreateIndex
CREATE UNIQUE INDEX "episodes_podcastId_guid_key" ON "episodes"("podcastId", "guid");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "podcast_categories_categoryId_podcastId_idx" ON "podcast_categories"("categoryId", "podcastId");

-- AddForeignKey
ALTER TABLE "episodes" ADD CONSTRAINT "episodes_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "podcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "podcast_categories" ADD CONSTRAINT "podcast_categories_podcastId_fkey" FOREIGN KEY ("podcastId") REFERENCES "podcasts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "podcast_categories" ADD CONSTRAINT "podcast_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
