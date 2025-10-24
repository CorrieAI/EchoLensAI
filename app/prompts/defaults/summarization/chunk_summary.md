---
key: summarization.chunk
name: Chunk Summary
category: summarization
description: Summarizes a section of a long podcast transcript that has been split into chunks
variables:
  - chunk_num
  - total_chunks
  - text
---

Summarize this section (part {{ chunk_num }} of {{ total_chunks }}) of a podcast transcript.
Focus on:
- Main topics discussed in this section
- Key insights and important points
- Any actionable advice or recommendations

Keep it detailed but concise (200-300 words).

IMPORTANT: Use proper markdown formatting:
- Use `##` for headings
- Use `-` or `*` for bullet points
- Use `**bold**` for emphasis

Transcript Section:
{{ text }}
