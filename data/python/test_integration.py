#!/usr/bin/env python3
"""
Integration tests for the full indicator execution flow with external datasets.
"""
import unittest
import pandas as pd
import numpy as np
import json
import sys
import os
import tempfile
import shutil
from io import StringIO

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from base_executor import BaseExecutor

# Create helper function for tests
def load_and_merge_external_datasets(main_df, config):
    """Wrapper for testing."""
    executor = BaseExecutor()
    return executor.load_and_merge_external_datasets(main_df, config)


class TestIntegrationFlow(unittest.TestCase):
    """Integration tests for complete external dataset flow."""

    def setUp(self):
        """Set up test environment."""
        self.test_dir = tempfile.mkdtemp()
        self.original_cwd = os.getcwd()

        # Create directory structure
        os.makedirs(os.path.join(self.test_dir, 'data', 'csv'), exist_ok=True)
        os.makedirs(os.path.join(self.test_dir, 'data', 'groups'), exist_ok=True)

        # Create main stock dataset
        dates = pd.date_range('2024-01-01', periods=20, freq='D')
        stock_data = pd.DataFrame({
            'date': dates,
            'open': np.random.uniform(100, 110, 20),
            'high': np.random.uniform(110, 120, 20),
            'low': np.random.uniform(90, 100, 20),
            'close': np.random.uniform(95, 105, 20),
            'volume': np.random.randint(1000000, 2000000, 20)
        })
        stock_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_stock_zh_a_hist.csv')
        stock_data.to_csv(stock_csv, index=False)

        # Create index dataset (external)
        index_data = pd.DataFrame({
            'date': dates,
            'open': np.random.uniform(3000, 3100, 20),
            'high': np.random.uniform(3100, 3200, 20),
            'low': np.random.uniform(2900, 3000, 20),
            'close': np.random.uniform(2950, 3050, 20),
            'volume': np.random.randint(10000000, 20000000, 20)
        })
        index_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_index_zh_a_hist.csv')
        index_data.to_csv(index_csv, index=False)

        # Create groups.json
        groups_data = {
            'groups': [
                {
                    'id': 'datasource_stock_zh_a_hist',
                    'name': 'A股历史数据',
                    'description': 'All stock data',
                    'datasetNames': ['000001_stock_zh_a_hist.csv'],
                    'isDataSource': True
                },
                {
                    'id': 'datasource_index_zh_a_hist',
                    'name': '指数历史数据',
                    'description': 'All index data',
                    'datasetNames': ['000001_index_zh_a_hist.csv'],
                    'isDataSource': True
                }
            ]
        }
        groups_file = os.path.join(self.test_dir, 'data', 'groups', 'groups.json')
        with open(groups_file, 'w') as f:
            json.dump(groups_data, f)

        # Change to test directory
        os.chdir(self.test_dir)

    def tearDown(self):
        """Clean up test environment."""
        os.chdir(self.original_cwd)
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    def test_full_merge_flow(self):
        """Test complete flow: load main data, load external, merge."""
        # Load main dataset
        main_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_stock_zh_a_hist.csv')
        main_df = pd.read_csv(main_csv)
        main_df['date'] = pd.to_datetime(main_df['date'])
        main_df.set_index('date', drop=False, inplace=True)
        main_df.index = main_df.index.normalize()

        # Configure external dataset
        config = {
            'index': {
                'groupId': 'datasource_index_zh_a_hist',
                'datasetName': '000001_index_zh_a_hist.csv'
            }
        }

        # Merge
        result = load_and_merge_external_datasets(main_df, config)

        # Verify all expected columns exist
        self.assertIn('open', result.columns, "Main dataset 'open' should exist")
        self.assertIn('close', result.columns, "Main dataset 'close' should exist")
        self.assertIn('index@open', result.columns, "External dataset 'index@open' should exist")
        self.assertIn('index@close', result.columns, "External dataset 'index@close' should exist")

        # Verify no data loss
        self.assertEqual(len(result), len(main_df), "Row count should match")

        # Verify external data was merged (not all NaN)
        self.assertFalse(result['index@close'].isna().all(), "External data should not be all NaN")

    def test_indicator_calculation_with_external(self):
        """Test that indicator can calculate using external dataset columns."""
        # Load main dataset
        main_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_stock_zh_a_hist.csv')
        main_df = pd.read_csv(main_csv)
        main_df['date'] = pd.to_datetime(main_df['date'])
        main_df.set_index('date', drop=False, inplace=True)
        main_df.index = main_df.index.normalize()

        # Configure and merge external dataset
        config = {
            'market': {
                'groupId': 'datasource_index_zh_a_hist',
                'datasetName': '000001_index_zh_a_hist.csv'
            }
        }
        merged_df = load_and_merge_external_datasets(main_df, config)

        # Simulate indicator calculation (relative strength)
        # This would be the user's indicator code
        try:
            relative_strength = merged_df['close'] / merged_df['market@close']
            self.assertEqual(len(relative_strength), len(merged_df))
            self.assertFalse(relative_strength.isna().all())
        except KeyError as e:
            self.fail(f"Indicator calculation failed with KeyError: {e}")

    def test_multiple_external_datasets(self):
        """Test merging multiple external datasets simultaneously."""
        # Create another external dataset
        dates = pd.date_range('2024-01-01', periods=20, freq='D')
        another_data = pd.DataFrame({
            'date': dates,
            'sentiment': np.random.uniform(0, 1, 20),
            'volatility': np.random.uniform(0.01, 0.05, 20)
        })
        another_csv = os.path.join(self.test_dir, 'data', 'csv', 'sentiment.csv')
        another_data.to_csv(another_csv, index=False)

        # Add to groups
        groups_file = os.path.join(self.test_dir, 'data', 'groups', 'groups.json')
        with open(groups_file, 'r') as f:
            groups_data = json.load(f)

        groups_data['groups'].append({
            'id': 'datasource_sentiment',
            'name': 'Sentiment Data',
            'datasetNames': ['sentiment.csv'],
            'isDataSource': True
        })

        with open(groups_file, 'w') as f:
            json.dump(groups_data, f)

        # Load main dataset
        main_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_stock_zh_a_hist.csv')
        main_df = pd.read_csv(main_csv)
        main_df['date'] = pd.to_datetime(main_df['date'])
        main_df.set_index('date', drop=False, inplace=True)
        main_df.index = main_df.index.normalize()

        # Configure multiple external datasets
        config = {
            'index': {
                'groupId': 'datasource_index_zh_a_hist',
                'datasetName': '000001_index_zh_a_hist.csv'
            },
            'sentiment': {
                'groupId': 'datasource_sentiment',
                'datasetName': 'sentiment.csv'
            }
        }

        # Merge
        result = load_and_merge_external_datasets(main_df, config)

        # Verify all external columns exist
        self.assertIn('index@close', result.columns)
        self.assertIn('sentiment@sentiment', result.columns)
        self.assertIn('sentiment@volatility', result.columns)

        # Verify original columns still exist
        self.assertIn('close', result.columns)
        self.assertIn('volume', result.columns)

    def test_date_mismatch_handling(self):
        """Test handling when external dataset has different date range."""
        # Create external with only first 10 days
        dates = pd.date_range('2024-01-01', periods=10, freq='D')
        partial_data = pd.DataFrame({
            'date': dates,
            'indicator': np.random.uniform(0, 1, 10)
        })
        partial_csv = os.path.join(self.test_dir, 'data', 'csv', 'partial.csv')
        partial_data.to_csv(partial_csv, index=False)

        # Add to groups
        groups_file = os.path.join(self.test_dir, 'data', 'groups', 'groups.json')
        with open(groups_file, 'r') as f:
            groups_data = json.load(f)

        groups_data['groups'].append({
            'id': 'datasource_partial',
            'name': 'Partial Data',
            'datasetNames': ['partial.csv'],
            'isDataSource': True
        })

        with open(groups_file, 'w') as f:
            json.dump(groups_data, f)

        # Load main dataset (20 days)
        main_csv = os.path.join(self.test_dir, 'data', 'csv', '000001_stock_zh_a_hist.csv')
        main_df = pd.read_csv(main_csv)
        main_df['date'] = pd.to_datetime(main_df['date'])
        main_df.set_index('date', drop=False, inplace=True)
        main_df.index = main_df.index.normalize()

        # Merge
        config = {
            'partial': {
                'groupId': 'datasource_partial',
                'datasetName': 'partial.csv'
            }
        }
        result = load_and_merge_external_datasets(main_df, config)

        # Should have all 20 rows
        self.assertEqual(len(result), 20)

        # First 10 rows should have values
        self.assertFalse(result['partial@indicator'].iloc[:10].isna().all())

        # Last 10 rows should be NaN (no match)
        self.assertTrue(result['partial@indicator'].iloc[10:].isna().all())


def run_tests():
    """Run all tests and print results."""
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    suite.addTests(loader.loadTestsFromTestCase(TestIntegrationFlow))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "="*70)
    print("INTEGRATION TEST SUMMARY")
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
