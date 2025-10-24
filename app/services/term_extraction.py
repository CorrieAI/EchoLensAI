import asyncio
import json

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.openai_client import get_chat_client
from app.services.prompt_loader import render_prompt


async def extract_terms(
    transcript: str,
    db: AsyncSession,
    existing_terms: list[str] | None = None,
    episode_title: str = None,
    max_chunks: int = None,
) -> list[dict]:
    """
    Extract terms from transcript using chunked analysis.

    Args:
        transcript: Full transcript text
        existing_terms: Terms already extracted (to avoid duplicates)
        episode_title: Episode title for context filtering
        max_chunks: Maximum number of chunks to process (for incremental extraction).
                   If None, processes all chunks. Use 2-3 for quick extraction of 5-10 terms.
    """

    # Split transcript into chunks with overlap
    chunk_size = 10000
    overlap = 500
    chunks = []

    for i in range(0, len(transcript), chunk_size - overlap):
        chunk = transcript[i : i + chunk_size]
        if chunk.strip():  # Only add non-empty chunks
            chunks.append(chunk)

    # If max_chunks specified, randomly sample chunks to get diverse terms
    if max_chunks and max_chunks < len(chunks):
        # Sample from different parts of transcript for diversity
        step = len(chunks) // max_chunks
        selected_chunks = [chunks[i * step] for i in range(max_chunks)]
    else:
        selected_chunks = chunks

    # Extract terms from selected chunks
    all_terms = []
    for i, chunk in enumerate(selected_chunks):
        chunk_terms = await _extract_terms_from_chunk(
            chunk, db, existing_terms, episode_title, chunk_num=i + 1, total_chunks=len(selected_chunks)
        )
        all_terms.extend(chunk_terms)

    # Deduplicate and rank by frequency/importance
    # For incremental extraction, return fewer terms per request
    max_terms = 10 if max_chunks else 20
    return _deduplicate_and_rank(all_terms, max_terms=max_terms)


async def _extract_terms_from_chunk(
    chunk: str,
    db: AsyncSession,
    existing_terms: list[str] | None = None,
    episode_title: str = None,
    chunk_num: int = 1,
    total_chunks: int = 1,
) -> list[dict]:
    """Extract terms from a single chunk of transcript"""

    existing_terms_str = ""
    if existing_terms:
        existing_terms_str = (
            f"\n\nALREADY EXTRACTED TERMS (do not repeat these):\n{', '.join(existing_terms[:50])}"
        )

    episode_context = ""
    if episode_title:
        episode_context = f"\n\nEPISODE CONTEXT: This is from '{episode_title}'. Do not extract the main subject/guest as a term."

    prompt = await render_prompt(
        db,
        "term_extraction.extract",
        chunk_num=chunk_num,
        total_chunks=total_chunks,
        chunk=chunk,
        existing_terms_str=existing_terms_str,
        episode_context=episode_context,
    )

    client = get_chat_client()
    response = await client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.3,
    )

    content = response.choices[0].message.content
    return _parse_terms_response(content)


def _deduplicate_and_rank(terms: list[dict], max_terms: int = 20) -> list[dict]:
    """
    Deduplicate terms and rank by frequency across chunks.
    Terms appearing 2-4 times are often most valuable (not too rare, not too common).
    """
    if not terms:
        return []

    # Track term occurrences (case-insensitive matching)
    term_data = {}  # term_lower -> list of term dicts

    for term_dict in terms:
        term_lower = term_dict["term"].lower().strip()
        if term_lower not in term_data:
            term_data[term_lower] = []
        term_data[term_lower].append(term_dict)

    # Score and rank terms
    scored_terms = []
    for term_lower, instances in term_data.items():
        frequency = len(instances)

        # Score: prefer terms appearing 2-4 times (sweet spot)
        if frequency == 1:
            score = 1
        elif 2 <= frequency <= 4:
            score = frequency * 2  # Boost these
        else:
            score = frequency  # Too common, lower priority

        # Use first instance (best context usually appears first)
        best_instance = instances[0]
        best_instance["frequency"] = frequency

        scored_terms.append((score, best_instance))

    # Sort by score descending, then alphabetically
    scored_terms.sort(key=lambda x: (-x[0], x[1]["term"]))

    # Return top N terms without score/frequency in output
    result = []
    for score, term_dict in scored_terms[:max_terms]:
        # Remove frequency field before returning
        cleaned = {k: v for k, v in term_dict.items() if k != "frequency"}
        result.append(cleaned)

    return result


def _parse_terms_response(content: str) -> list[dict]:
    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        terms = json.loads(content.strip())

        # Filter to only valid Term model fields
        valid_fields = {"term", "context", "explanation"}
        return [{k: v for k, v in term.items() if k in valid_fields} for term in terms]
    except (json.JSONDecodeError, IndexError):
        return []


async def extract_terms_fast(
    chunk: str, db: AsyncSession, existing_terms: list[str] | None = None, episode_title: str = None
) -> list[dict]:
    """
    Fast term extraction: First extract term names only, then get definitions in parallel.
    Much faster than asking for everything at once.
    """
    existing_terms = existing_terms or []

    # Step 1: Extract just the term names (fast)
    existing_terms_str = ""
    if existing_terms:
        existing_terms_str = (
            f"\n\nALREADY EXTRACTED TERMS (do not repeat these):\n{', '.join(existing_terms[:100])}"
        )

    episode_context = ""
    if episode_title:
        episode_context = (
            f"\n\nEPISODE CONTEXT: From '{episode_title}'. Do not extract the main subject/guest."
        )

    extraction_prompt = await render_prompt(
        db,
        "term_extraction.extract_names",
        existing_terms_str=existing_terms_str,
        episode_context=episode_context,
        chunk=chunk,
    )

    client = get_chat_client()
    response = await client.chat.completions.create(
        model=settings.chat_model,
        messages=[{"role": "user", "content": extraction_prompt}],
        temperature=0.3,
    )

    content = response.choices[0].message.content
    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        term_names = json.loads(content.strip())
    except (json.JSONDecodeError, IndexError):
        return []

    if not isinstance(term_names, list):
        return []

    # Step 2: Get definitions for each term in parallel (fast)
    async def get_definition(term: str) -> dict:
        """Get definition and context for a single term"""
        def_prompt = await render_prompt(db, "term_extraction.get_definition", term=term, chunk=chunk[:5000])

        try:
            client = get_chat_client()
            resp = await client.chat.completions.create(
                model=settings.chat_model,
                messages=[{"role": "user", "content": def_prompt}],
                temperature=0.3,
            )
            result = resp.choices[0].message.content
            if "```json" in result:
                result = result.split("```json")[1].split("```")[0]
            elif "```" in result:
                result = result.split("```")[1].split("```")[0]
            parsed = json.loads(result.strip())

            # Validate that explanation is not empty
            if not parsed.get("explanation") or not parsed.get("explanation").strip():
                return None

            return parsed
        except Exception:
            return None

    # Run definition requests in parallel
    tasks = [get_definition(term) for term in term_names if term]
    results = await asyncio.gather(*tasks)

    # Filter to only valid Term model fields and ensure explanation exists
    valid_fields = {"term", "context", "explanation"}
    filtered_results = []
    for r in results:
        if r and r.get("term") and r.get("explanation") and r.get("explanation").strip():
            filtered_results.append({k: v for k, v in r.items() if k in valid_fields})

    return filtered_results
