"""Explicit, dev-friendly database backup (control for RISK-04).

Run:  python -m app.backup [target_path]
Copies the SQLite file to backend/backups/veyora-backup-<timestamp>.db
(or the given path). It never deletes anything.
"""
import shutil
import sys
from datetime import datetime
from pathlib import Path

from . import create_app


def main() -> None:
    app = create_app()
    uri = app.config["SQLALCHEMY_DATABASE_URI"]
    if not uri.startswith("sqlite:///"):
        print("Backup command supports the local SQLite setup only.")
        sys.exit(1)
    src = Path(uri.removeprefix("sqlite:///"))
    if not src.exists():
        print(f"No database file at {src}. Nothing to back up.")
        sys.exit(1)
    if len(sys.argv) > 1:
        dest = Path(sys.argv[1])
    else:
        dest_dir = Path(__file__).resolve().parent.parent / "backups"
        dest_dir.mkdir(exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        dest = dest_dir / f"veyora-backup-{stamp}.db"
    shutil.copy2(src, dest)
    print(f"Backup written to {dest}")


if __name__ == "__main__":
    main()
