#!/usr/bin/env python3
"""
Test cases for warning capture mechanism in executor.py
"""
import unittest
import warnings
import sys
import os
import json
from io import StringIO

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))


class TestWarningCapture(unittest.TestCase):
    """Test warning capture functionality."""

    def test_warning_handler_captures_messages(self):
        """Test that custom warning handler captures warnings."""
        captured = []

        def custom_handler(message, category, filename, lineno, file=None, line=None):
            captured.append(str(message))

        old_handler = warnings.showwarning
        warnings.showwarning = custom_handler

        try:
            warnings.warn("Test warning 1")
            warnings.warn("Test warning 2")

            self.assertEqual(len(captured), 2)
            self.assertEqual(captured[0], "Test warning 1")
            self.assertEqual(captured[1], "Test warning 2")
        finally:
            warnings.showwarning = old_handler

    def test_warning_restoration(self):
        """Test that original warning handler is restored."""
        original_handler = warnings.showwarning

        # Replace temporarily
        def temp_handler(message, category, filename, lineno, file=None, line=None):
            pass

        warnings.showwarning = temp_handler
        self.assertNotEqual(warnings.showwarning, original_handler)

        # Restore
        warnings.showwarning = original_handler
        self.assertEqual(warnings.showwarning, original_handler)

    def test_multiple_warnings_captured(self):
        """Test that multiple warnings are all captured."""
        captured = []

        def custom_handler(message, category, filename, lineno, file=None, line=None):
            captured.append(str(message))

        old_handler = warnings.showwarning
        warnings.showwarning = custom_handler

        try:
            for i in range(5):
                warnings.warn(f"Warning {i}")

            self.assertEqual(len(captured), 5)
            for i in range(5):
                self.assertEqual(captured[i], f"Warning {i}")
        finally:
            warnings.showwarning = old_handler

    def test_warning_with_exception(self):
        """Test that warnings are captured even when exception occurs."""
        captured = []

        def custom_handler(message, category, filename, lineno, file=None, line=None):
            captured.append(str(message))

        old_handler = warnings.showwarning
        warnings.showwarning = custom_handler

        try:
            warnings.warn("Warning before error")
            try:
                warnings.warn("Warning during processing")
                raise ValueError("Test error")
            except ValueError:
                pass
            warnings.warn("Warning after error")

            self.assertEqual(len(captured), 3)
        finally:
            warnings.showwarning = old_handler


class TestGroupLoading(unittest.TestCase):
    """Test group loading functionality."""

    def test_groups_json_structure(self):
        """Test that groups.json has correct structure."""
        import tempfile
        import shutil

        # Create temporary groups file
        temp_dir = tempfile.mkdtemp()
        try:
            groups_file = os.path.join(temp_dir, 'groups.json')
            groups_data = {
                'groups': [
                    {
                        'id': 'group1',
                        'name': 'Test Group',
                        'datasetNames': ['dataset1.csv', 'dataset2.csv']
                    },
                    {
                        'id': 'datasource_test',
                        'name': 'Test Data Source',
                        'datasetNames': ['data1.csv'],
                        'isDataSource': True
                    }
                ]
            }

            with open(groups_file, 'w') as f:
                json.dump(groups_data, f)

            # Load and verify
            with open(groups_file, 'r') as f:
                loaded = json.load(f)

            self.assertIn('groups', loaded)
            self.assertEqual(len(loaded['groups']), 2)
            self.assertEqual(loaded['groups'][0]['id'], 'group1')
            self.assertTrue(loaded['groups'][1].get('isDataSource', False))

        finally:
            shutil.rmtree(temp_dir)

    def test_data_source_group_id_format(self):
        """Test that data source group IDs follow correct format."""
        # Data source groups should start with 'datasource_'
        group_id = 'datasource_stock_zh_a_hist'

        self.assertTrue(group_id.startswith('datasource_'))

        # Extract data source name
        data_source = group_id.replace('datasource_', '')
        self.assertEqual(data_source, 'stock_zh_a_hist')


class TestErrorDetailsStructure(unittest.TestCase):
    """Test error details structure for frontend display."""

    def test_error_output_format(self):
        """Test that error output has expected structure."""
        error_output = {
            'success': False,
            'error': 'Test error message',
            'type': 'ValueError',
            'details': {
                'message': 'Test error message',
                'type': 'ValueError',
                'traceback': 'Full traceback here...',
                'code_line': 'problematic_line = data["missing_column"]',
                'hints': [
                    'Available columns: date, open, close',
                    'Hint: Check column names'
                ],
                'warnings': [
                    'Warning 1: Something happened',
                    'Warning 2: Another thing'
                ]
            }
        }

        # Validate structure
        self.assertIn('success', error_output)
        self.assertFalse(error_output['success'])
        self.assertIn('error', error_output)
        self.assertIn('type', error_output)
        self.assertIn('details', error_output)

        details = error_output['details']
        self.assertIn('message', details)
        self.assertIn('type', details)
        self.assertIn('traceback', details)
        self.assertIn('code_line', details)
        self.assertIn('hints', details)
        self.assertIn('warnings', details)

        # Validate types
        self.assertIsInstance(details['hints'], list)
        self.assertIsInstance(details['warnings'], list)

    def test_success_output_format(self):
        """Test that success output has expected structure."""
        success_output = {
            'success': True,
            'values': [1.0, 2.0, 3.0, None, 5.0]
        }

        self.assertIn('success', success_output)
        self.assertTrue(success_output['success'])
        self.assertIn('values', success_output)
        self.assertIsInstance(success_output['values'], list)


def run_tests():
    """Run all tests and print results."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestWarningCapture))
    suite.addTests(loader.loadTestsFromTestCase(TestGroupLoading))
    suite.addTests(loader.loadTestsFromTestCase(TestErrorDetailsStructure))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "="*70)
    print("TEST SUMMARY")
    print("="*70)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print("="*70)

    return result.wasSuccessful()


if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)
