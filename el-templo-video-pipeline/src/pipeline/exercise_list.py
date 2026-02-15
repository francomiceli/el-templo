"""Exercise list extraction from the El Templo MySQL database."""

import os
import re
from pathlib import Path

import pymysql
from dotenv import load_dotenv


# Load .env from pipeline project root
_env_path = Path(__file__).parent.parent.parent / ".env"
load_dotenv(_env_path)


def _get_connection() -> pymysql.Connection:
    """Create a MySQL connection from environment variables."""
    return pymysql.connect(
        host=os.environ.get("DB_HOST", "localhost"),
        port=int(os.environ.get("DB_PORT", "3306")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD", ""),
        database=os.environ.get("DB_NAME", "eltemplo"),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
    )


def get_exercise_list(level: str | None = None) -> list[dict[str, str | int | None]]:
    """Query the exercises table and return a list of exercise dicts.

    Each dict contains: id, exercise (name), level, route, pattern, category.
    Results are sorted by level then exercise name.

    Args:
        level: Optional level filter (e.g., "alfa", "delta", "sigma", "omega", "spartan").
               If None, returns all exercises.

    Returns:
        List of exercise dicts with keys: id, exercise, level, route, pattern, category.
    """
    connection = _get_connection()
    try:
        with connection.cursor() as cursor:
            query = """
                SELECT id, exercise, level, route, pattern, category
                FROM exercises
            """
            params: list[str] = []

            if level is not None:
                query += " WHERE level = %s"
                params.append(level)

            query += " ORDER BY level, exercise"

            cursor.execute(query, params)
            rows: list[dict[str, str | int | None]] = cursor.fetchall()
            return rows
    finally:
        connection.close()


def slugify(name: str) -> str:
    """Convert an exercise name to a filename-safe slug.

    Lowercase, replace spaces with hyphens, remove special characters,
    collapse multiple hyphens, strip leading/trailing hyphens.

    Examples:
        >>> slugify("Bench Press (Barbell)")
        'bench-press-barbell'
        >>> slugify("Pull-Up")
        'pull-up'
        >>> slugify("  Squat  ")
        'squat'
    """
    # Lowercase and strip whitespace
    slug = name.strip().lower()
    # Replace spaces and underscores with hyphens
    slug = re.sub(r"[\s_]+", "-", slug)
    # Remove special characters (keep only alphanumeric and hyphens)
    slug = re.sub(r"[^a-z0-9-]", "", slug)
    # Collapse multiple hyphens
    slug = re.sub(r"-+", "-", slug)
    # Strip leading/trailing hyphens
    slug = slug.strip("-")
    return slug
