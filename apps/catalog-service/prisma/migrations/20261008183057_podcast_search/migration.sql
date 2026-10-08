CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE "podcasts" ADD COLUMN "search_vector" tsvector;

CREATE FUNCTION podcasts_search_vector_refresh() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.author, '')), 'B') ||
    setweight(to_tsvector('simple', left(coalesce(NEW.description, ''), 2000)), 'C');
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER podcasts_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, author, description ON "podcasts"
  FOR EACH ROW EXECUTE FUNCTION podcasts_search_vector_refresh();

UPDATE "podcasts" SET title = title;

CREATE INDEX "podcasts_search_vector_idx" ON "podcasts" USING GIN ("search_vector");

CREATE INDEX "podcasts_title_trgm_idx" ON "podcasts" USING GIN ("title" gin_trgm_ops);
