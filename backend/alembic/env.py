# backend/alembic/env.py

import os
from logging.config import fileConfig

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool, text

# Load .env (local dev convenience; Cloud Run will use real env vars)
load_dotenv()

# Alembic Config object
config = context.config

# Logging setup
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ✅ Import Base
from app.db import Base  # noqa: E402

# ✅ IMPORTANT: Import models so Alembic "sees" tables
from app.models.job import Job  # noqa: F401, E402
from app.models.media import Media  # noqa: F401, E402
from app.models.conversation import MediaConversation, ConversationMessage  # noqa: F401, E402

target_metadata = Base.metadata


def get_url() -> str:
    """
    Returns the DB URL from environment.
    We intentionally ignore alembic.ini's sqlalchemy.url to prevent accidental
    migrations against the wrong database.
    """
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set")
    return url


def _debug_connection(connection) -> None:
    """
    Prints DB identity diagnostics to stdout.
    Useful to confirm Alembic is hitting the DB you think it is.
    Safe to leave in (you can gate it with ALEMBIC_DEBUG=1).
    """
    if os.getenv("ALEMBIC_DEBUG", "0") != "1":
        return

    try:
        db = connection.execute(text("select current_database()")).scalar()
        user = connection.execute(text("select current_user")).scalar()
        schema = connection.execute(text("select current_schema()")).scalar()
        search_path = connection.execute(text("show search_path")).scalar()
        server = connection.execute(
            text("select inet_server_addr()::text, inet_server_port()::text")
        ).fetchone()
        sysid = connection.execute(
            text("select (pg_control_system()).system_identifier")
        ).scalar()

        # Do NOT print full DATABASE_URL (it contains password).
        redacted_url = get_url()
        # crude redaction: user:pass@ -> user:***@
        if "://" in redacted_url and "@" in redacted_url:
            prefix, rest = redacted_url.split("://", 1)
            creds_host = rest.split("@", 1)
            if len(creds_host) == 2:
                creds, hostpart = creds_host
                if ":" in creds:
                    u, _p = creds.split(":", 1)
                    redacted_url = f"{prefix}://{u}:***@{hostpart}"

        print("ALEMBIC_DEBUG sqlalchemy.url =", redacted_url, flush=True)
        print("ALEMBIC_DEBUG db =", db, flush=True)
        print("ALEMBIC_DEBUG user =", user, flush=True)
        print("ALEMBIC_DEBUG schema =", schema, flush=True)
        print("ALEMBIC_DEBUG search_path =", search_path, flush=True)
        print("ALEMBIC_DEBUG server =", server, flush=True)
        print("ALEMBIC_DEBUG sysid =", sysid, flush=True)
    except Exception as ex:
        print("ALEMBIC_DEBUG failed:", repr(ex), flush=True)


def run_migrations_offline() -> None:
    """
    Run migrations in 'offline' mode.

    This configures the context with just a URL, not an Engine.
    """
    # ✅ Force Alembic to use env DATABASE_URL even in offline mode
    config.set_main_option("sqlalchemy.url", get_url())

    # Optional: helpful to see which URL would be used (redacted)
    if os.getenv("ALEMBIC_DEBUG", "0") == "1":
        url = get_url()
        if "://" in url and "@" in url:
            prefix, rest = url.split("://", 1)
            creds_host = rest.split("@", 1)
            if len(creds_host) == 2:
                creds, hostpart = creds_host
                if ":" in creds:
                    u, _p = creds.split(":", 1)
                    url = f"{prefix}://{u}:***@{hostpart}"
        print("ALEMBIC_DEBUG offline sqlalchemy.url =", url, flush=True)

    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """
    Run migrations in 'online' mode.

    In this scenario we need to create an Engine and associate a connection
    with the context.
    """
    # ✅ Force Alembic to use env DATABASE_URL (overrides alembic.ini)
    config.set_main_option("sqlalchemy.url", get_url())

    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = config.get_main_option("sqlalchemy.url")

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        future=True,
    )

    with connectable.connect() as connection:
        # ✅ Print DB identity diagnostics if ALEMBIC_DEBUG=1
        _debug_connection(connection)

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
