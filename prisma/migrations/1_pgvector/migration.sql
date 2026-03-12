-- Enable pgvector extension (requires superuser or rds_superuser on some providers)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add native vector column
ALTER TABLE "QASet" ADD COLUMN IF NOT EXISTS "embeddingVec" vector(1536);

-- Create IVFFlat index for cosine similarity search
CREATE INDEX IF NOT EXISTS idx_qaset_embedding_vec ON "QASet"
  USING ivfflat ("embeddingVec" vector_cosine_ops) WITH (lists = 100);
