---
key: summarization.single_pass
name: Single-Pass Summary
category: summarization
description: Summarizes a complete podcast transcript in one pass when it fits within token limits (short episodes)
variables:
  - text
---

Create a comprehensive summary of this podcast episode.
Include:
- Main topics discussed
- Key insights and takeaways
- Important points made by speakers
- Any actionable advice or recommendations

Keep it concise (250-350 words maximum).

IMPORTANT: Use proper markdown formatting:
- Start with the heading `## Episode Summary` (exactly this title, no other variation)
- Use `###` for subsections
- Use `-` or `*` for bullet points (not just indentation)
- Use `**bold**` for key terms or emphasis
- Use proper paragraph spacing with blank lines

Transcript:
{{ text }}
