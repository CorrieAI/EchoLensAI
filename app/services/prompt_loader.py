import re
from pathlib import Path

import structlog
import yaml
from jinja2 import Template
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.prompt import Prompt

logger = structlog.get_logger(__name__)


def parse_prompt_file(filepath: Path) -> dict:
    """Parse a .md prompt file with YAML frontmatter"""
    content = filepath.read_text()

    # Extract frontmatter and content
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", content, re.DOTALL)
    if not match:
        raise ValueError(f"Invalid prompt file format: {filepath}")

    frontmatter_text, prompt_text = match.groups()
    frontmatter = yaml.safe_load(frontmatter_text)

    return {
        "key": frontmatter["key"],
        "name": frontmatter["name"],
        "category": frontmatter["category"],
        "description": frontmatter.get("description", ""),
        "variables": frontmatter.get("variables", []),
        "content": prompt_text.strip(),
    }


async def seed_prompts(db: AsyncSession) -> None:
    """Load default prompts from .md files and seed database (adds new prompts if they don't exist)"""

    logger.info("prompt_seeding_started")

    # Get all .md files from prompts/defaults directory
    prompts_dir = Path(__file__).parent.parent / "prompts" / "defaults"
    prompt_files = list(prompts_dir.rglob("*.md"))

    added = 0
    skipped = 0

    for filepath in prompt_files:
        try:
            data = parse_prompt_file(filepath)

            # Check if this specific prompt already exists
            result = await db.execute(select(Prompt).where(Prompt.key == data["key"]))
            existing = result.scalar_one_or_none()

            if existing:
                skipped += 1
                continue

            # Create prompt in database
            prompt = Prompt(
                key=data["key"],
                name=data["name"],
                category=data["category"],
                description=data["description"],
                variables=data["variables"],
                content=data["content"],
                default_content=data["content"],  # Store original as default
            )

            db.add(prompt)
            logger.info("prompt_added", key=data['key'], name=data['name'])
            added += 1

        except Exception as e:
            logger.error("prompt_load_error", filepath=str(filepath), error=str(e))

    if added > 0:
        await db.commit()
        logger.info("prompt_seeding_complete", added=added, skipped=skipped)
    else:
        logger.info("prompt_seeding_skipped", skipped=skipped)


async def get_prompt(db: AsyncSession, key: str) -> Prompt | None:
    """Get a prompt from the database by key"""
    result = await db.execute(select(Prompt).where(Prompt.key == key))
    return result.scalar_one_or_none()


async def render_prompt(db: AsyncSession, key: str, **variables) -> str:
    """Get a prompt and render it with Jinja2 template variables"""
    prompt = await get_prompt(db, key)
    if not prompt:
        raise ValueError(f"Prompt not found: {key}")

    template = Template(prompt.content)
    return template.render(**variables)


async def get_all_prompts(db: AsyncSession) -> list[Prompt]:
    """Get all prompts grouped by category"""
    result = await db.execute(select(Prompt).order_by(Prompt.category, Prompt.key))
    return list(result.scalars().all())


async def update_prompt(db: AsyncSession, key: str, content: str) -> Prompt:
    """Update a prompt's content"""
    prompt = await get_prompt(db, key)
    if not prompt:
        raise ValueError(f"Prompt not found: {key}")

    prompt.content = content
    await db.commit()
    await db.refresh(prompt)
    return prompt


async def reset_prompt(db: AsyncSession, key: str) -> Prompt:
    """Reset a prompt to its default content"""
    prompt = await get_prompt(db, key)
    if not prompt:
        raise ValueError(f"Prompt not found: {key}")

    prompt.content = prompt.default_content
    await db.commit()
    await db.refresh(prompt)
    return prompt
