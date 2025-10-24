---
key: term_extraction.extract_names
name: Extract Term Names (fast)
category: term_extraction
description: Quickly extracts just the names of unique terms without full details
variables:
  - existing_terms_str
  - episode_context
  - chunk
---

Extract ONLY unique, esoteric, or specialized terms from this transcript that listeners would benefit from learning about.

EXCLUDE: sponsors, hosts, main guests, common concepts, brand names, generic job titles
PRIORITIZE: esoteric concepts, historical figures, philosophical ideas, technical jargon, academic concepts

Return ONLY a JSON array of term names: ["term1", "term2", "term3"]
Aim for 5-10 terms maximum.{{ existing_terms_str }}{{ episode_context }}

Transcript:
{{ chunk }}
