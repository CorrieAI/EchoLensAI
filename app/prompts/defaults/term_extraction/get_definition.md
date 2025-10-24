---
key: term_extraction.get_definition
name: Get Term Definition
category: term_extraction
description: Gets the definition and context for a specific term from a transcript excerpt
variables:
  - term
  - chunk
---

For the term "{{ term }}" from this transcript excerpt, provide:
1. The corrected/proper spelling if the term appears misspelled
2. A brief explanation (1-2 sentences) - REQUIRED, cannot be empty
3. The sentence where it appears (context)

If the term is not found or misspelled, infer the correct spelling and provide the explanation anyway.

Return as JSON: {"term": "corrected term name", "explanation": "must provide explanation", "context": "..."}

IMPORTANT: The explanation field is REQUIRED and must not be empty. Always provide a clear, concise explanation.

Transcript excerpt:
{{ chunk }}
