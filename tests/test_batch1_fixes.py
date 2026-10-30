"""
Advance ERP — Batch 1 Bug Remediation Test Suite (Milestone 3)
Tests BUG-01, BUG-02, BUG-04, and BUG-11.
"""
import io
import os
import json
import unittest
from flask_jwt_extended import create_access_token
from app import create_app, db
from app.models import User, Report, DBTaskCatalog


class TestBatch1Fixes(unittest.TestCase):
    """Verifies remediations for BUG-01, BUG-02, BUG-04, and BUG-11."""

    @classmethod
    def setUpClass(cls):
        cls.app = create_app()
        cls.client = cls.app.test_client()

    def get_auth_headers(self, email='vaibhav@agalabs.com'):
        """Generate JWT auth headers for an active SuperAdmin user."""
        with self.app.app_context():
            token = create_access_token(identity=email)
        return {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

    # =========================================================================
    # BUG-01: Missing 'import os' in app/routes/admin.py
    # =========================================================================
    def test_bug01_get_settings_succeeds_without_name_error(self):
        """GET /api/admin/settings succeeds with HTTP 200 and defaults without NameError for 'os'."""
        headers = self.get_auth_headers()
        res = self.client.get('/api/admin/settings', headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200, got {res.status_code}: {res.data}")
        data = res.get_json()
        self.assertTrue(data.get('success'))
        settings = data.get('settings', {})
        self.assertIn('smtpHost', settings)
        self.assertIn('smtpPort', settings)
        self.assertIn('smtpUser', settings)

    # =========================================================================
    # BUG-02: SQL Injection & Missing Auth in /api/admin/table-schema/<table_name>
    # =========================================================================
    def test_bug02_table_schema_requires_jwt_and_rejects_unauthenticated(self):
        """GET /api/admin/table-schema/<table_name> returns HTTP 401 if unauthenticated."""
        res = self.client.get('/api/admin/table-schema/valid_table_name')
        self.assertEqual(res.status_code, 401, f"Expected 401 for unauthenticated request, got {res.status_code}")

    def test_bug02_table_schema_rejects_sql_injection_attempts(self):
        """GET /api/admin/table-schema/<table_name> strictly rejects non-alphanumeric table names with HTTP 400."""
        headers = self.get_auth_headers()
        malicious_inputs = [
            'test`; SELECT sleep(1); --',
            "test'; DROP TABLE users; --",
            'test` UNION SELECT 1,2,3',
            'test/../../etc/passwd',
            'test\\..\\windows\\win.ini',
            'table name with spaces',
            'table$special#chars!',
        ]
        for bad_name in malicious_inputs:
            res = self.client.get(f'/api/admin/table-schema/{bad_name}', headers=headers)
            self.assertEqual(res.status_code, 400, f"Expected 400 for '{bad_name}', got {res.status_code}: {res.data}")
            data = res.get_json()
            self.assertFalse(data.get('success'))
            self.assertIn('Invalid table name format', data.get('error', ''))

    def test_bug02_table_schema_accepts_valid_identifier_with_auth(self):
        """GET /api/admin/table-schema/<table_name> accepts valid alphanumeric/underscore identifiers."""
        headers = self.get_auth_headers()
        res = self.client.get('/api/admin/table-schema/valid_table_name_123', headers=headers)
        self.assertEqual(res.status_code, 200, f"Expected 200 for valid table name, got {res.status_code}: {res.data}")
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('table'), 'valid_table_name_123')
        self.assertIsInstance(data.get('columns'), list)

    # =========================================================================
    # BUG-04: Path Traversal in /api/mis/upload-pdf and /api/mis/auto-detect
    # =========================================================================
    def test_bug04_mis_upload_pdf_sanitizes_path_traversal(self):
        """PDF file uploads sanitize path traversal sequences and keep saved files within UPLOAD_FOLDER."""
        with self.app.app_context():
            token = create_access_token(identity='vaibhav@agalabs.com')

        # Dummy minimal valid PDF bytes
        pdf_bytes = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF"
        data = {
            'file': (io.BytesIO(pdf_bytes), '../../evil_path_traversal.pdf'),
            'reportType': 'test'
        }
        res = self.client.post(
            '/api/mis/upload-pdf',
            data=data,
            headers={'Authorization': f'Bearer {token}'},
            content_type='multipart/form-data'
        )
        # Even if parsing fails or succeeds, ensure file path traversal did not escape UPLOAD_FOLDER
        upload_folder = self.app.config.get('UPLOAD_FOLDER', 'uploads')
        escaped_file = os.path.join(upload_folder, '..', 'evil_path_traversal.pdf')
        escaped_file_resolved = os.path.abspath(escaped_file)
        self.assertFalse(os.path.exists(escaped_file_resolved), "Path traversal succeeded in escaping upload folder!")

        # Clean up any created test upload inside uploads/
        for fname in os.listdir(upload_folder):
            if 'evil_path_traversal.pdf' in fname:
                try:
                    os.remove(os.path.join(upload_folder, fname))
                except Exception:
                    pass

    # =========================================================================
    # BUG-11: Unprotected Mutating Endpoints via @jwt_required(optional=True)
    # =========================================================================
    def test_bug11_mutating_endpoints_reject_unauthenticated_requests(self):
        """Verify that state-mutating endpoints reject unauthenticated callers with HTTP 401."""
        endpoints = [
            ('DELETE', '/api/admin/table-mappings/999999', None),
            ('POST', '/api/crishi/pull', {'catalogId': 1, 'slaHours': 24}),
            ('POST', '/api/crishi/skip', {'catalogId': 1, 'reason': 'Holiday'}),
            ('POST', '/api/crishi/roster/apply-week', {'week': 1}),
            ('PUT', '/api/roster/rake-zones', {'person': 'Test', 'zones': 'CR'}),
            ('POST', '/api/roster/rake-date', {'date': '2026-11-01'}),
            ('PUT', '/api/roster/monthly-duties', {'duties': []}),
            ('POST', '/api/roster/apply-week', {'week': 1}),
            ('POST', '/api/roster/assign-backup', {'dutyRole': 'Scrapper', 'primaryUser': 'A', 'backupUser': 'B'}),
            ('POST', '/api/roster/generate-random', {'weeks': 5}),
            ('PUT', '/api/roster/scrapper-matrix', {'matrix': []}),
            ('POST', '/api/roster/structure', {'matrix': []}),
        ]

        for method, url, payload in endpoints:
            kwargs = {}
            if payload is not None:
                kwargs['data'] = json.dumps(payload)
                kwargs['content_type'] = 'application/json'

            if method == 'DELETE':
                res = self.client.delete(url, **kwargs)
            elif method == 'POST':
                res = self.client.post(url, **kwargs)
            elif method == 'PUT':
                res = self.client.put(url, **kwargs)
            else:
                self.fail(f"Unsupported method {method}")

            self.assertEqual(
                res.status_code, 401,
                f"Endpoint {method} {url} allowed unauthenticated caller (got HTTP {res.status_code}, expected 401)"
            )


if __name__ == '__main__':
    unittest.main()
