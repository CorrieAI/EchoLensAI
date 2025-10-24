# Database Migrations

This directory contains database migration scripts for EchoLens.

## Automatic Dimension Validation

⚡ **NEW**: The backend now automatically validates vector dimensions on startup!

- If dimensions mismatch but **no embeddings exist**, it auto-updates the schema ✅
- If dimensions mismatch and **embeddings exist**, it shows a clear error with migration instructions ❌

This prevents the cryptic "expected X dimensions, not Y" errors during processing.

## Changing Embedding Dimensions

If you switch between embedding models with different vector dimensions, you need to:

1. **Update `.env` file** with the correct `EMBEDDING_DIMENSIONS`:
   ```bash
   # For OpenAI text-embedding-3-small
   EMBEDDING_DIMENSIONS=1536

   # For nomic-embed-text (Ollama)
   EMBEDDING_DIMENSIONS=768

   # For OpenAI text-embedding-3-large
   EMBEDDING_DIMENSIONS=3072
   ```

2. **Run the migration script**:
   ```bash
   # First, backup your database!
   # Then run:
   PGPASSWORD=your_password psql -h localhost -U your_user -d your_database -f app/migrations/change_vector_dimensions.sql
   ```

   Or manually run the ALTER TABLE commands for your dimension:
   ```sql
   ALTER TABLE transcriptions ALTER COLUMN embedding TYPE vector(768);
   ALTER TABLE terms ALTER COLUMN embedding TYPE vector(768);
   ALTER TABLE vector_slices ALTER COLUMN embedding TYPE vector(768);
   ```

3. **Restart services**:
   ```bash
   docker restart echolens-celery
   # Your backend should auto-reload
   ```

4. **Reprocess episodes** (optional but recommended):
   - Delete existing embeddings: `DELETE FROM vector_slices; DELETE FROM transcriptions; UPDATE terms SET embedding = NULL;`
   - Reprocess episodes through the UI to generate new embeddings with the correct dimensions

## Why This Is Needed

Different embedding models produce vectors of different sizes:
- **OpenAI text-embedding-3-small**: 1536 dimensions
- **OpenAI text-embedding-3-large**: 3072 dimensions
- **nomic-embed-text** (Ollama): 768 dimensions

PostgreSQL's pgvector extension requires the vector column dimension to match the size of vectors you're inserting. If they don't match, you'll get errors like:

```
ValueError: expected 1536 dimensions, not 768
```

## Notes

- The migration **deletes all existing embeddings** when you change dimensions
- Make sure your `.env` `EMBEDDING_DIMENSIONS` matches the database schema
- The app reads `EMBEDDING_DIMENSIONS` from `.env` at startup and uses it for all vector operations
