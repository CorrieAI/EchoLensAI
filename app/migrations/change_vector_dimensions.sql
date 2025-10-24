-- Migration to change vector dimensions from 1536 to 768 (or any other dimension)
-- Run this script if you're switching between embedding models with different dimensions
-- For example: OpenAI (1536) -> nomic-embed-text (768)

-- WARNING: This will delete all existing embeddings!
-- Make sure to backup your database before running this migration.

-- Option 1: Change to 768 dimensions (nomic-embed-text, Ollama)
ALTER TABLE transcriptions ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE terms ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE vector_slices ALTER COLUMN embedding TYPE vector(768);

-- Option 2: Change to 1536 dimensions (OpenAI text-embedding-3-small)
-- Uncomment these lines instead if switching to OpenAI:
-- ALTER TABLE transcriptions ALTER COLUMN embedding TYPE vector(1536);
-- ALTER TABLE terms ALTER COLUMN embedding TYPE vector(1536);
-- ALTER TABLE vector_slices ALTER COLUMN embedding TYPE vector(1536);

-- Option 3: Change to 3072 dimensions (OpenAI text-embedding-3-large)
-- Uncomment these lines instead if using the large model:
-- ALTER TABLE transcriptions ALTER COLUMN embedding TYPE vector(3072);
-- ALTER TABLE terms ALTER COLUMN embedding TYPE vector(3072);
-- ALTER TABLE vector_slices ALTER COLUMN embedding TYPE vector(3072);

-- After changing dimensions, you'll need to reprocess episodes to generate new embeddings
