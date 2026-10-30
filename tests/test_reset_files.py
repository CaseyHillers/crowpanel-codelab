import contextlib
import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]


class FakeFilesystem:
    def __init__(self, tree, fail=None):
        self.tree = tree
        self.fail = fail
        self.removed = []
        self.synced = False

    def node(self, path):
        if not path.startswith("/"):
            raise AssertionError("Reset must use absolute device paths")
        node = self.tree
        for part in path.split("/")[1:]:
            if part:
                node = node[part]
        return node

    def ilistdir(self, path):
        for name, child in self.node(path).items():
            yield (name, 0x4000 if isinstance(child, dict) else 0x8000, 0)

    def delete(self, path, directory):
        if path == self.fail:
            raise OSError("private path must not be printed")
        parent, name = path.rsplit("/", 1)
        node = self.node(parent or "/")
        if directory:
            assert node[name] == {}, "Directory deleted before its children"
        del node[name]
        self.removed.append(path)

    def remove(self, path):
        self.delete(path, False)

    def rmdir(self, path):
        self.delete(path, True)

    def sync(self):
        self.synced = True


class ResetFilesTests(unittest.TestCase):
    def reset(self, filesystem, **limits):
        spec = importlib.util.spec_from_file_location(
            "reset_under_test", ROOT / "device/diagnostics/reset_files.py",
        )
        module = importlib.util.module_from_spec(spec)
        with patch.dict("sys.modules", {"os": filesystem}):
            spec.loader.exec_module(module)
        self.output = io.StringIO()
        with contextlib.redirect_stdout(self.output):
            module.reset_files(**limits)
        return self.output.getvalue()

    def test_empty_filesystem_is_valid_and_synced(self):
        filesystem = FakeFilesystem({})
        self.assertEqual(self.reset(filesystem), "WORKSHOP FILES CLEARED\n")
        self.assertTrue(filesystem.synced)
        self.assertEqual(filesystem.removed, [])

    def test_clears_boot_files_secrets_hidden_files_and_nested_directories(self):
        filesystem = FakeFilesystem({
            "boot.py": "boot", "main.py": "app", "wifi_config.py": "secret",
            ".settings": "private", "lib": {"pkg": {"module.mpy": b"binary"}},
            "empty": {},
        })
        self.assertEqual(self.reset(filesystem), "WORKSHOP FILES CLEARED\n")
        self.assertEqual(filesystem.tree, {})
        self.assertTrue(filesystem.synced)
        self.assertLess(filesystem.removed.index("/lib/pkg/module.mpy"),
                        filesystem.removed.index("/lib/pkg"))
        self.assertLess(filesystem.removed.index("/lib/pkg"),
                        filesystem.removed.index("/lib"))
        self.assertNotIn("/", filesystem.removed)

    def test_deletion_failure_never_prints_success_or_private_filename(self):
        filesystem = FakeFilesystem({"private-ssid": "secret"}, fail="/private-ssid")
        with self.assertRaisesRegex(RuntimeError, "reset incomplete") as error:
            self.reset(filesystem)
        self.assertEqual(self.output.getvalue(), "")
        self.assertNotIn("private-ssid", str(error.exception))
        self.assertIsNone(error.exception.__context__)
        self.assertFalse(filesystem.synced)
        self.assertIn("private-ssid", filesystem.tree)

    def test_file_count_limit_stops_before_mutating_oversized_directory(self):
        filesystem = FakeFilesystem({str(number): "x" for number in range(4)})
        with self.assertRaisesRegex(RuntimeError, "file count limit"):
            self.reset(filesystem, max_entries=3)
        self.assertEqual(filesystem.removed, [])
        self.assertFalse(filesystem.synced)

    def test_depth_limit_stops_before_deleting_nested_contents(self):
        filesystem = FakeFilesystem({"one": {"two": {"file": "x"}}})
        with self.assertRaisesRegex(RuntimeError, "depth limit"):
            self.reset(filesystem, max_depth=1)
        self.assertEqual(filesystem.removed, [])

    def test_file_limit_counts_across_directories(self):
        filesystem = FakeFilesystem({"one": {"file": "x"}, "two": {"file": "y"}})
        with self.assertRaisesRegex(RuntimeError, "file count limit"):
            self.reset(filesystem, max_entries=3)
        self.assertIn("two", filesystem.tree)
        self.assertFalse(filesystem.synced)


if __name__ == "__main__":
    unittest.main()
