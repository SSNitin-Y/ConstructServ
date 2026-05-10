# scripts/init_db.py

from app.db import Base, engine
from app.models.media import Media      # noqa: F401 - imported so Base knows it
from app.models.job import Job          # noqa: F401 - same here


def init():
    print("Creating tables...")
    Base.metadata.create_all(bind=engine)
    print("Done.")


if __name__ == "__main__":
    init()