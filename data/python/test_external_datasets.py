#!/usr/bin/env python3
"""
Test cases for external dataset loading and merging functionality.
"""
import unittest
import pandas as pd
import numpy as np
import tempfile
import json
import os
import sys
from datetime import datetime, timedelta

# Add current directory to path to import the modules
sys.path.insert(0, os.path.dirname(__file__))

# Import functions to test
from base_executor import BaseExecutor

# Create helper function for tests
def load_and_merge_external_datasets(main_df, config):
    """Wrapper for testing."""
    executor = BaseExecutor()
    return executor.load_and_merge_external_datasets(main_df, config)


class TestExternalDatasetMerge(unittest.TestCase):
    """Test external dataset loading and merging."""

    def setUp(self):
        """Set up test fixtures."""
        # Create temporary directory for test data
        self.test_dir = tempfile.mkdtemp()

        # Create main dataset
        dates = pd.date_range('2024-01-01', periods=10, freq='D')
        self.main_df = pd.DataFrame({
            'date': dates,
            'close': np.random.uniform(100, 110, 10),
            'volume': np.random.randint(1000, 2000, 10)
        })
        self.main_df.set_index('date', drop=False, inplace=True)
        self.main_df.index = self.main_df.index.normalize()

    def tearDown(self):
        """Clean up test fixtures."""
        # Remove temporary directory
        import shutil
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_normalize_date_format(self):
        """Test that different date formats are normalized correctly."""
        # Create dataframes with different date formats
        dates1 = pd.to_datetime(['2024-01-01', '2024-01-02', '2024-01-03'])
        dates2 = pd.to_datetime(['2024-01-01 00:00:00', '2024-01-02 12:30:00', '2024-01-03 23:59:59'])

        df1 = pd.DataFrame({'value': [1, 2, 3]}, index=dates1)
        df2 = pd.DataFrame({'value': [10, 20, 30]}, index=dates2)

        # Normalize both
        df1.index = df1.index.normalize()
        df2.index = df2.index.normalize()

        # They should now match
        merged = df1.join(df2, how='left', rsuffix='_ext')

        # Check that merge was successful
        self.assertEqual(len(merged), 3)
        self.assertFalse(merged['value_ext'].isna().any())
        self.assertEqual(merged['value_ext'].iloc[0], 10)

    def test_empty_external_config(self):
        """Test that empty config returns original dataframe."""
        result = load_and_merge_external_datasets(self.main_df, {})

        pd.testing.assert_frame_equal(result, self.main_df)

    def test_none_external_config(self):
        """Test that None config returns original dataframe."""
        result = load_and_merge_external_datasets(self.main_df, None)

        pd.testing.assert_frame_equal(result, self.main_df)

    def test_column_renaming(self):
        """Test that external dataset columns are renamed correctly."""
        # Create a simple external dataset CSV
        csv_path = os.path.join(self.test_dir, 'ext_data.csv')
        ext_data = pd.DataFrame({
            'date': pd.date_range('2024-01-01', periods=10, freq='D'),
            'open': np.random.uniform(95, 105, 10),
            'high': np.random.uniform(105, 115, 10),
        })
        ext_data.to_csv(csv_path, index=False)

        # Create a mock groups.json
        groups_file = os.path.join(self.test_dir, 'groups.json')
        groups_data = {
            'groups': [
                {
                    'id': 'datasource_test',
                    'name': 'Test Group',
                    'datasetNames': ['ext_data.csv']
                }
            ]
        }
        with open(groups_file, 'w') as f:
            json.dump(groups_data, f)

        # Mock the file paths
        original_cwd = os.getcwd()
        original_groups_path = os.path.join(original_cwd, 'data', 'groups', 'groups.json')
        original_csv_dir = os.path.join(original_cwd, 'data', 'csv')

        # Create temporary structure
        os.makedirs(os.path.join(self.test_dir, 'data', 'groups'), exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, 'data', 'csv'), exist_ok=True)

        # Copy test files
        import shutil
        shutil.copy(groups_file, os.path.join(self.test_dir, 'data', 'groups', 'groups.json'))
        shutil.copy(csv_path, os.path.join(self.test_dir, 'data', 'csv', 'ext_data.csv'))

        # Change to test directory
        os.chdir(self.test_dir)

        try:
            # Test the merge
            config = {
                'index': {
                    'groupId': 'datasource_test',
                    'datasetName': 'ext_data.csv'
                }
            }

            result = load_and_merge_external_datasets(self.main_df.copy(), config)

            # Check that columns were renamed with @ prefix
            self.assertIn('index@open', result.columns)
            self.assertIn('index@high', result.columns)

            # Check that original columns still exist
            self.assertIn('close', result.columns)
            self.assertIn('volume', result.columns)

            # Check that merge was successful (no NaN values for matching dates)
            self.assertFalse(result['index@open'].isna().all())

        finally:
            # Restore original directory
            os.chdir(original_cwd)

    def test_date_index_types(self):
        """Test that DatetimeIndex is properly handled."""
        # Test with DatetimeIndex
        df = self.main_df.copy()
        self.assertIsInstance(df.index, pd.DatetimeIndex)

        # After normalization
        df.index = df.index.normalize()
        self.assertIsInstance(df.index, pd.DatetimeIndex)

        # Check that all times are midnight
        for dt in df.index:
            self.assertEqual(dt.hour, 0)
            self.assertEqual(dt.minute, 0)
            self.assertEqual(dt.second, 0)

    def test_left_join_behavior(self):
        """Test that LEFT JOIN preserves all main dataset rows."""
        # Create external dataset with fewer dates
        ext_dates = pd.date_range('2024-01-01', periods=5, freq='D')
        ext_df = pd.DataFrame({
            'value': [100, 200, 300, 400, 500]
        }, index=ext_dates)
        ext_df.index = ext_df.index.normalize()

        # Merge with main dataset (10 rows)
        result = self.main_df.join(ext_df, how='left')

        # Should have all 10 rows from main dataset
        self.assertEqual(len(result), 10)

        # First 5 rows should have values from external
        self.assertFalse(result['value'].iloc[:5].isna().any())

        # Last 5 rows should be NaN (no match)
        self.assertTrue(result['value'].iloc[5:].isna().all())


class TestDateNormalization(unittest.TestCase):
    """Test date normalization logic."""

    def test_normalize_removes_time(self):
        """Test that normalize removes time component."""
        dt = pd.to_datetime('2024-01-15 14:30:45')
        df = pd.DataFrame({'value': [1]}, index=[dt])

        df.index = df.index.normalize()

        normalized_dt = df.index[0]
        self.assertEqual(normalized_dt.hour, 0)
        self.assertEqual(normalized_dt.minute, 0)
        self.assertEqual(normalized_dt.second, 0)
        self.assertEqual(normalized_dt.microsecond, 0)

    def test_timezone_handling(self):
        """Test that timezone-aware and naive datetimes can be merged."""
        # Create timezone-aware datetime
        dt_aware = pd.to_datetime('2024-01-15 14:30:45').tz_localize('UTC')
        df_aware = pd.DataFrame({'value_aware': [1]}, index=[dt_aware])

        # Create timezone-naive datetime
        dt_naive = pd.to_datetime('2024-01-15 10:20:30')
        df_naive = pd.DataFrame({'value_naive': [2]}, index=[dt_naive])

        # Normalize dates - extract date component for tz-aware, normalize for naive
        if df_aware.index.tz is not None:
            df_aware.index = pd.DatetimeIndex(df_aware.index.date)
        else:
            df_aware.index = df_aware.index.normalize()

        if df_naive.index.tz is not None:
            df_naive.index = pd.DatetimeIndex(df_naive.index.date)
        else:
            df_naive.index = df_naive.index.normalize()

        # Should now be able to join
        result = df_aware.join(df_naive, how='left')

        # Both values should be present (both dates are 2024-01-15)
        self.assertFalse(result['value_naive'].isna().iloc[0])
        self.assertEqual(result['value_aware'].iloc[0], 1)
        self.assertEqual(result['value_naive'].iloc[0], 2)

        # Both should be timezone-naive
        self.assertIsNone(result.index.tz)

    def test_date_preservation(self):
        """Test that date component is preserved when removing timezone."""
        # Create timezone-aware datetime at midnight UTC
        dt_utc = pd.to_datetime('1999-11-10T00:00:00.000').tz_localize('UTC')
        df = pd.DataFrame({'value': [100]}, index=[dt_utc])

        # Extract date component as displayed (no timezone conversion)
        df.index = pd.DatetimeIndex(df.index.date)

        # Date should still be 1999-11-10, not shifted to 1999-11-09
        result_date = df.index[0]
        self.assertEqual(result_date.year, 1999)
        self.assertEqual(result_date.month, 11)
        self.assertEqual(result_date.day, 10)
        self.assertEqual(result_date.hour, 0)
        # Should be timezone-naive
        self.assertIsNone(result_date.tzinfo)

    def test_date_preservation_with_time(self):
        """Test that date is extracted correctly when timezone-aware datetime has time component."""
        # Create timezone-aware datetime with time component
        dt_utc = pd.to_datetime('1999-11-10T14:30:00.000').tz_localize('UTC')
        df = pd.DataFrame({'value': [100]}, index=[dt_utc])

        # Extract date component as displayed (no timezone conversion)
        df.index = pd.DatetimeIndex(df.index.date)

        # Date should be 1999-11-10 at midnight (time component removed)
        result_date = df.index[0]
        self.assertEqual(result_date.year, 1999)
        self.assertEqual(result_date.month, 11)
        self.assertEqual(result_date.day, 10)
        self.assertEqual(result_date.hour, 0)
        # Should be timezone-naive
        self.assertIsNone(result_date.tzinfo)

    def test_date_extraction_from_iso_string(self):
        """Test that ISO format date strings are parsed to correct date."""
        # Parse ISO format string with timezone
        dates = pd.to_datetime(['1999-11-10T00:00:00.000+00:00', '2024-01-15T00:00:00.000+00:00'])
        df = pd.DataFrame({'value': [100, 200]}, index=dates)

        # Extract date component
        if df.index.tz is not None:
            df.index = pd.DatetimeIndex(df.index.date)

        # First date should be 1999-11-10, not 1999-11-09
        self.assertEqual(df.index[0].year, 1999)
        self.assertEqual(df.index[0].month, 11)
        self.assertEqual(df.index[0].day, 10)

        # Second date should be 2024-01-15
        self.assertEqual(df.index[1].year, 2024)
        self.assertEqual(df.index[1].month, 1)
        self.assertEqual(df.index[1].day, 15)

    def test_normalize_preserves_date(self):
        """Test that normalize preserves the date part."""
        dt = pd.to_datetime('2024-01-15 14:30:45')
        df = pd.DataFrame({'value': [1]}, index=[dt])

        df.index = df.index.normalize()

        normalized_dt = df.index[0]
        self.assertEqual(normalized_dt.year, 2024)
        self.assertEqual(normalized_dt.month, 1)
        self.assertEqual(normalized_dt.day, 15)

    def test_normalize_consistent_matching(self):
        """Test that normalized dates match correctly."""
        # Different time components, same date
        dt1 = pd.to_datetime('2024-01-15 00:00:00')
        dt2 = pd.to_datetime('2024-01-15 23:59:59')

        df1 = pd.DataFrame({'v1': [1]}, index=[dt1])
        df2 = pd.DataFrame({'v2': [2]}, index=[dt2])

        # Without normalize - won't match
        result_no_norm = df1.join(df2, how='left')
        self.assertTrue(result_no_norm['v2'].isna().iloc[0])

        # With normalize - will match
        df1.index = df1.index.normalize()
        df2.index = df2.index.normalize()
        result_norm = df1.join(df2, how='left')
        self.assertFalse(result_norm['v2'].isna().iloc[0])
        self.assertEqual(result_norm['v2'].iloc[0], 2)


class TestColumnRenaming(unittest.TestCase):
    """Test column renaming logic for external datasets."""

    def test_rename_format(self):
        """Test that columns are renamed with correct format."""
        df = pd.DataFrame({
            'open': [100, 101],
            'close': [102, 103],
            'volume': [1000, 1100]
        })

        param_name = 'index'
        renamed_cols = {col: f'{param_name}@{col}' for col in df.columns}
        df.rename(columns=renamed_cols, inplace=True)

        expected_cols = ['index@open', 'index@close', 'index@volume']
        self.assertListEqual(list(df.columns), expected_cols)

    def test_no_name_collision(self):
        """Test that renamed columns don't collide with main dataset."""
        main_df = pd.DataFrame({
            'open': [100, 101],
            'close': [102, 103]
        })

        ext_df = pd.DataFrame({
            'open': [200, 201],
            'close': [202, 203]
        })

        # Rename external columns
        renamed_cols = {col: f'ext@{col}' for col in ext_df.columns}
        ext_df.rename(columns=renamed_cols, inplace=True)

        # Join
        result = pd.concat([main_df, ext_df], axis=1)

        # Should have both sets of columns
        self.assertIn('open', result.columns)
        self.assertIn('close', result.columns)
        self.assertIn('ext@open', result.columns)
        self.assertIn('ext@close', result.columns)

        # Values should be different
        self.assertNotEqual(result['open'].iloc[0], result['ext@open'].iloc[0])


def run_tests():
    """Run all tests and print results."""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test cases
    suite.addTests(loader.loadTestsFromTestCase(TestExternalDatasetMerge))
    suite.addTests(loader.loadTestsFromTestCase(TestDateNormalization))
    suite.addTests(loader.loadTestsFromTestCase(TestColumnRenaming))

    # Run tests with verbose output
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
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
