import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from native_boundary import install_tool


class PinnedToolCacheTests(unittest.TestCase):
    def setUp(self):
        self.workspace = tempfile.TemporaryDirectory()
        self.addCleanup(self.workspace.cleanup)
        self.destination = Path(self.workspace.name) / 'compiler.zip'
        self.data = b'pinned compiler bytes'
        self.digest = hashlib.sha256(self.data).hexdigest()
        self.url = 'https://example.invalid/compiler.zip'

    def install(self):
        install_tool(self.destination, self.url, self.digest)

    def test_cold_download_is_verified_and_saved(self):
        with patch('native_boundary.urllib.request.urlopen', return_value=io.BytesIO(self.data)) as request:
            self.install()
        request.assert_called_once_with(self.url, timeout=120)
        self.assertEqual(self.destination.read_bytes(), self.data)

    def test_valid_cache_works_without_network(self):
        self.destination.write_bytes(self.data)
        with patch('native_boundary.urllib.request.urlopen', side_effect=AssertionError('network used')):
            self.install()
        self.assertEqual(self.destination.read_bytes(), self.data)

    def test_corrupt_cache_is_downloaded_again(self):
        self.destination.write_bytes(b'corrupt cache')
        with patch('native_boundary.urllib.request.urlopen', return_value=io.BytesIO(self.data)) as request:
            self.install()
        request.assert_called_once()
        self.assertEqual(self.destination.read_bytes(), self.data)

    def test_invalid_download_is_rejected_without_saving(self):
        with patch('native_boundary.urllib.request.urlopen', return_value=io.BytesIO(b'wrong bytes')):
            with self.assertRaisesRegex(ValueError, 'Invalid pinned tool integrity'):
                self.install()
        self.assertFalse(self.destination.exists())

    def test_network_failure_remains_a_failure(self):
        with patch('native_boundary.urllib.request.urlopen', side_effect=TimeoutError('offline')):
            with self.assertRaises(TimeoutError):
                self.install()
        self.assertFalse(self.destination.exists())


if __name__ == '__main__':
    unittest.main()
