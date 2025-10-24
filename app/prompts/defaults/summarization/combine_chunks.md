---
key: summarization.combine_chunks
name: Combine Chunk Summaries
category: summarization
description: Combines multiple chunk summaries into a final comprehensive summary for long episodes that were split
variables:
  - combined
---

You are reviewing summaries from different parts of a podcast episode.
Create a comprehensive final summary that:
- Integrates insights from all parts
- Identifies main topics discussed throughout
- Highlights key insights and takeaways
- Notes any actionable advice or recommendations
- Maintains narrative flow

Keep the final summary concise (300-400 words maximum).

IMPORTANT: Use proper markdown formatting:
- Start with the heading `## Episode Summary` (exactly this title, no other variation)
- Use `###` for subsections
- Use `-` or `*` for bullet points (not just indentation)
- Use `**bold**` for key terms or emphasis
- Use proper paragraph spacing with blank lines between paragraphs

PART SUMMARIES:
{{ combined }}
