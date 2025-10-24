---
key: term_extraction.extract
name: Extract Terms (with details)
category: term_extraction
description: Extracts unique and esoteric terms from a podcast transcript chunk with full context and explanations
variables:
  - chunk_num
  - total_chunks
  - chunk
  - existing_terms_str
  - episode_context
---

Analyze this podcast transcript segment (part {{ chunk_num }}/{{ total_chunks }}) and extract ONLY unique, esoteric, or specialized terms that listeners would benefit from learning about.

EXCLUDE these types of terms:
- Podcast sponsors, advertisers, or product placements
- The podcast host or platform (Lex Fridman, YouTube, etc.)
- The main subject/guest of this episode
- Common concepts everyone knows (freedom, privacy, democracy, etc.)
- Brand names unless historically or technically significant
- Generic job titles or organizations

PRIORITIZE these types of terms:
- Esoteric or specialized concepts (e.g., "Kafkaesque", "panopticon")
- Historical figures or movements (not current/living people unless historically notable)
- Philosophical ideas and schools of thought (e.g., "Stoicism", "asceticism")
- Technical jargon requiring domain expertise
- Academic or scientific concepts
- Unique methodologies, frameworks, or systems
- Obscure historical events or periods

For each term, provide:
1. The exact term (use consistent casing/spelling)
2. Context (the sentence where it appears)
3. A brief explanation
4. Category: concept, technical, person, organization, methodology{{ existing_terms_str }}{{ episode_context }}

Return as JSON array: [{"term": "...", "context": "...", "explanation": "...", "category": "..."}]

Focus on educational value - terms that expand knowledge, not common vocabulary.

Transcript segment:
{{ chunk }}
