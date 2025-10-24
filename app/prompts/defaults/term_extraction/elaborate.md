---
key: term_extraction.elaborate
name: Elaborate Term Explanation
category: term_extraction
description: Generates a detailed 3-5 paragraph explanation when user clicks "Elaborate" on a term
variables:
  - term
  - explanation
  - context
---

Provide a detailed, elaborate explanation of the term "{{ term }}".

Current brief explanation: {{ explanation }}

Context where it appeared: {{ context if context else "Not available" }}

Please provide:
1. A comprehensive explanation (3-5 paragraphs)
2. Historical context or origins if relevant
3. How it's used or applied
4. Related concepts or terms
5. Why it's significant or interesting

Make it educational and engaging, suitable for someone who wants to deeply understand this concept.

IMPORTANT: Use proper markdown formatting:
- Use `#` for main headings, `##` for subheadings, `###` for sub-subheadings
- Use `-` or `*` for bullet points (not just indentation)
- Use `|` for tables with proper header separators
- Use `**bold**` for emphasis
- Use proper paragraph spacing with blank lines
