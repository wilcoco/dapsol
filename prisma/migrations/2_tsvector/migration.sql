-- Add tsvector column for full-text search
ALTER TABLE "QASet" ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Populate from existing data
UPDATE "QASet" SET search_vector =
  setweight(to_tsvector('simple', COALESCE(title, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE("searchKeywords", '')), 'C');

-- GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_qaset_search_vector ON "QASet" USING GIN (search_vector);

-- Trigger function to auto-update search_vector on insert/update
CREATE OR REPLACE FUNCTION qaset_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.title, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.summary, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW."searchKeywords", '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS qaset_search_vector_trigger ON "QASet";
CREATE TRIGGER qaset_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title, summary, "searchKeywords"
  ON "QASet"
  FOR EACH ROW
  EXECUTE FUNCTION qaset_search_vector_update();
