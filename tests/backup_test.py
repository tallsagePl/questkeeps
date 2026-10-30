import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("database_backup", Path(__file__).parents[1] / "deploy/database-backup.py")
backup = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backup)


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.source = self.root / "live.sqlite"
        self.folder = self.root / "backups"
        self.db = sqlite3.connect(self.source)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("CREATE TABLE users(id INTEGER PRIMARY KEY)")
        self.db.execute("CREATE TABLE trips(id INTEGER PRIMARY KEY)")
        self.db.execute("CREATE TABLE media(id INTEGER PRIMARY KEY)")
        self.db.execute("PRAGMA user_version=12")
        self.db.execute("INSERT INTO users VALUES (1)")
        self.db.commit()

    def tearDown(self):
        self.db.close()
        self.temporary.cleanup()

    def test_snapshot_contains_committed_wal_and_reopens_without_sidecars(self):
        self.db.execute("INSERT INTO users VALUES (2)")
        self.db.commit()
        result = backup.create_snapshot(self.source, self.folder)
        self.assertEqual(result["counts"]["users"], 2)
        restored = self.root / "restored.sqlite"
        restored.write_bytes((self.folder / "latest.sqlite").read_bytes())
        self.assertEqual(backup.inspect_snapshot(restored)["counts"]["users"], 2)
        self.assertFalse(Path(str(restored) + "-wal").exists())

    def test_failed_verification_preserves_previous_copy_and_success_date(self):
        first = backup.create_snapshot(self.source, self.folder)
        original = (self.folder / "latest.sqlite").read_bytes()
        self.db.execute("INSERT INTO users VALUES (3)")
        self.db.commit()
        with patch.object(backup, "inspect_snapshot", side_effect=RuntimeError("broken")):
            with self.assertRaises(RuntimeError):
                backup.create_snapshot(self.source, self.folder)
        self.assertEqual((self.folder / "latest.sqlite").read_bytes(), original)
        state = json.loads((self.folder / "status.json").read_text())
        self.assertFalse(state["ok"])
        self.assertEqual(state["last_success"], first["last_success"])
        self.assertFalse(list(self.folder.glob(".snapshot-*")))

    def test_disk_full_preserves_previous_copy(self):
        backup.create_snapshot(self.source, self.folder)
        original = (self.folder / "latest.sqlite").read_bytes()
        with patch.object(backup.shutil, "disk_usage", return_value=type("Usage", (), {"free": 0})()):
            with self.assertRaisesRegex(RuntimeError, "Insufficient disk"):
                backup.create_snapshot(self.source, self.folder)
        self.assertEqual((self.folder / "latest.sqlite").read_bytes(), original)

    def test_missing_database_preserves_previous_copy_and_marks_failure(self):
        backup.create_snapshot(self.source, self.folder)
        original = (self.folder / "latest.sqlite").read_bytes()
        with self.assertRaises(FileNotFoundError):
            backup.create_snapshot(self.root / "missing.sqlite", self.folder)
        self.assertEqual((self.folder / "latest.sqlite").read_bytes(), original)
        self.assertFalse(json.loads((self.folder / "status.json").read_text())["ok"])

    def test_wrong_database_does_not_replace_valid_backup(self):
        backup.create_snapshot(self.source, self.folder)
        original = (self.folder / "latest.sqlite").read_bytes()
        wrong = self.root / "wrong.sqlite"
        sqlite3.connect(wrong).close()
        with self.assertRaisesRegex(RuntimeError, "complete QuestKeeps"):
            backup.create_snapshot(wrong, self.folder)
        self.assertEqual((self.folder / "latest.sqlite").read_bytes(), original)

    def test_refuses_to_overwrite_working_database(self):
        source = self.root / "latest.sqlite"
        source.write_bytes(self.source.read_bytes())
        with self.assertRaisesRegex(ValueError, "working database"):
            backup.create_snapshot(source, self.root)


if __name__ == "__main__":
    unittest.main()
