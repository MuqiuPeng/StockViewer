#!/usr/bin/env python3
"""
Base executor class with shared functionality for indicator and backtest execution.
"""
import os
import sys
import json
import warnings
import pandas as pd
import numpy as np
from typing import Dict, Any, Optional, List


class BaseExecutor:
    """Base class for all executors with shared data preparation functionality."""

    def __init__(self):
        """Initialize base executor."""
        self.captured_warnings: List[str] = []
        self._old_warning_handler = None
        self._dataset_cache: Dict[str, pd.DataFrame] = {}
        self._group_cache: Dict[str, dict] = {}

    def setup_warning_capture(self) -> None:
        """Set up warning capture mechanism."""
        def warning_handler(message, category, filename, lineno, file=None, line=None):
            self.captured_warnings.append(str(message))

        self._old_warning_handler = warnings.showwarning
        warnings.showwarning = warning_handler

    def restore_warning_handler(self) -> None:
        """Restore original warning handler."""
        if self._old_warning_handler:
            warnings.showwarning = self._old_warning_handler

    def load_group_definition(self, group_name: str) -> dict:
        """
        Load a group definition from groups.json.

        Args:
            group_name: Name of the group to load

        Returns:
            Group definition dictionary
        """
        # Check cache first
        if group_name in self._group_cache:
            return self._group_cache[group_name]

        # Load groups.json
        groups_file = os.path.join(os.getcwd(), 'data', 'groups', 'groups.json')

        if not os.path.exists(groups_file):
            raise FileNotFoundError(f"Groups file not found: {groups_file}")

        with open(groups_file, 'r', encoding='utf-8') as f:
            groups_data = json.load(f)

        # Find the group by name
        for group in groups_data.get('groups', []):
            if group['name'] == group_name:
                self._group_cache[group_name] = group
                return group

        raise ValueError(f"Group '{group_name}' not found in groups.json")

    def load_dataset_from_group(self, group_name: str, dataset_identifier: str) -> pd.DataFrame:
        """
        Load a dataset that belongs to a specific group.

        Args:
            group_name: Name of the group the dataset belongs to
            dataset_identifier: Dataset name within the group (stock code or filename)

        Returns:
            DataFrame with the loaded data
        """
        # Create cache key
        cache_key = f"{group_name}:{dataset_identifier}"

        # Check cache first
        if cache_key in self._dataset_cache:
            return self._dataset_cache[cache_key].copy()

        # Load group definition
        group = self.load_group_definition(group_name)

        # Find the dataset in the group
        dataset_name = None
        for ds_name in group.get('datasetNames', []):
            # Match by stock code or full filename
            ds_code = ds_name.replace('.csv', '').split('_')[0]
            if ds_code == dataset_identifier or ds_name == dataset_identifier or ds_name.replace('.csv', '') == dataset_identifier:
                dataset_name = ds_name
                break

        if not dataset_name:
            raise ValueError(
                f"Dataset '{dataset_identifier}' not found in group '{group_name}'. "
                f"Available datasets: {', '.join(group.get('datasetNames', []))}"
            )

        # Construct file path
        csv_dir = os.path.join(os.getcwd(), 'data', 'csv')
        file_path = os.path.join(csv_dir, dataset_name)

        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Dataset file not found: {file_path}")

        # Load CSV
        df = pd.read_csv(file_path)

        # Parse date column
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
        elif '日期' in df.columns:
            df['date'] = pd.to_datetime(df['日期'])
            df = df.drop('日期', axis=1)

        # Cache it
        self._dataset_cache[cache_key] = df.copy()

        return df

    def normalize_dataframe_dates(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Normalize dates in DataFrame index to date-only (remove time component and timezone).
        Preserves the date component exactly as displayed (no timezone conversion).

        For example: 1999-11-10T00:00:00.000+00:00 → 1999-11-10 (not 1999-11-09!)

        Args:
            df: DataFrame with datetime index

        Returns:
            DataFrame with normalized date index (timezone-naive)
        """
        if isinstance(df.index, pd.DatetimeIndex):
            if df.index.tz is not None:
                # Extract the date component as displayed (year, month, day)
                # This avoids timezone conversion
                date_only = df.index.date
                # Convert back to datetime at midnight (naive)
                df.index = pd.DatetimeIndex(date_only)
            else:
                # Already naive, just normalize to midnight
                df.index = df.index.normalize()
        return df

    def load_and_merge_external_datasets(
        self,
        main_df: pd.DataFrame,
        external_datasets_config: Optional[Dict[str, Dict[str, str]]]
    ) -> pd.DataFrame:
        """
        Load external datasets and LEFT JOIN them with the main dataset on date.
        Columns from external datasets are renamed to {param_name}@{column_name}.

        Args:
            main_df: Main DataFrame with date index
            external_datasets_config: Dict mapping parameter names to dataset configs
                                       Format: {param_name: {groupId: str, datasetName: str}}

        Returns:
            DataFrame with external datasets merged in

        Example:
            config = {'index': {'groupId': 'datasource_index_zh_a_hist', 'datasetName': '000001.csv'}}
            result = load_and_merge_external_datasets(main_df, config)
            # result has columns like: date, open, close, index@open, index@close, ...
        """
        if not external_datasets_config:
            return main_df

        # Create a copy to avoid modifying the original
        result_df = main_df.copy()

        # First, load groups.json to resolve group IDs to group names
        groups_file = os.path.join(os.getcwd(), 'data', 'groups', 'groups.json')
        if not os.path.exists(groups_file):
            warnings.warn(f"groups.json not found, skipping external datasets")
            return result_df

        with open(groups_file, 'r', encoding='utf-8') as f:
            groups_data = json.load(f)

        # Create mapping from group ID to group name
        group_id_to_name = {}
        for group in groups_data.get('groups', []):
            group_id_to_name[group['id']] = group['name']

        # Load and merge each external dataset
        for param_name, dataset_config in external_datasets_config.items():
            try:
                group_id = dataset_config.get('groupId')
                dataset_name = dataset_config.get('datasetName')

                if not group_id or not dataset_name:
                    warnings.warn(f"Skipping incomplete external dataset config for '{param_name}'")
                    continue

                # Check if "All" datasets is selected
                if dataset_name == '__all__':
                    result_df = self._merge_all_datasets_from_group(
                        result_df, param_name, group_id, group_id_to_name, groups_data
                    )
                    continue

                # Load the external dataset
                ext_df = None
                if group_id.startswith('datasource_'):
                    # Data source group - load directly from CSV file
                    csv_path = os.path.join(os.getcwd(), 'data', 'csv', dataset_name)
                    if not os.path.exists(csv_path):
                        warnings.warn(f"Dataset file not found: {csv_path}")
                        continue

                    ext_df = pd.read_csv(csv_path)
                else:
                    # Custom group - resolve group ID to group name
                    group_name = group_id_to_name.get(group_id)
                    if not group_name:
                        warnings.warn(f"Group ID '{group_id}' not found for parameter '{param_name}'")
                        continue

                    # Load the dataset from group
                    ext_df = self.load_dataset_from_group(group_name, dataset_name)

                if ext_df is None or ext_df.empty:
                    warnings.warn(f"External dataset '{param_name}' is empty, skipping")
                    continue

                # Prepare external dataset for merging
                if 'date' in ext_df.columns:
                    ext_df['date'] = pd.to_datetime(ext_df['date'])
                    ext_df.set_index('date', drop=True, inplace=True)

                # Normalize date indices to date-only (remove time component and timezone) for reliable matching
                # This ensures dates in different formats match correctly
                # Extract date component as displayed to avoid timezone conversion
                if isinstance(result_df.index, pd.DatetimeIndex):
                    if result_df.index.tz is not None:
                        # Extract date component (year, month, day) as displayed
                        result_df.index = pd.DatetimeIndex(result_df.index.date)
                    else:
                        result_df.index = result_df.index.normalize()

                if isinstance(ext_df.index, pd.DatetimeIndex):
                    if ext_df.index.tz is not None:
                        # Extract date component (year, month, day) as displayed
                        ext_df.index = pd.DatetimeIndex(ext_df.index.date)
                    else:
                        ext_df.index = ext_df.index.normalize()

                # Rename all columns to {param_name}@{column_name}
                renamed_cols = {col: f'{param_name}@{col}' for col in ext_df.columns}
                ext_df.rename(columns=renamed_cols, inplace=True)

                # Left join on date index
                result_df = result_df.join(ext_df, how='left')

                print(f"INFO: Merged external dataset '{param_name}' with {len(renamed_cols)} columns", file=sys.stderr)

            except Exception as e:
                warnings.warn(f"Failed to load/merge external dataset '{param_name}': {e}")
                import traceback
                import sys
                traceback.print_exc(file=sys.stderr)
                continue

        return result_df

    def _merge_all_datasets_from_group(
        self,
        result_df: pd.DataFrame,
        param_name: str,
        group_id: str,
        group_id_to_name: Dict[str, str],
        groups_data: dict
    ) -> pd.DataFrame:
        """
        Merge ALL datasets from a group, creating dict columns for each column name.

        When accessing data['{param_name}@{col_name}'], returns a Series where each row
        is a dict of {dataset_name: value}.

        Args:
            result_df: Main DataFrame to merge into
            param_name: Parameter name for this external dataset
            group_id: ID of the group to load all datasets from
            group_id_to_name: Mapping of group IDs to names
            groups_data: Full groups data from groups.json

        Returns:
            DataFrame with dict columns for each column in the datasets
        """
        # Find the group
        group_info = None
        for group in groups_data.get('groups', []):
            if group['id'] == group_id:
                group_info = group
                break

        if not group_info:
            warnings.warn(f"Group ID '{group_id}' not found for parameter '{param_name}'")
            return result_df

        dataset_names = group_info.get('datasetNames', [])
        if not dataset_names:
            warnings.warn(f"No datasets found in group for parameter '{param_name}'")
            return result_df

        print(f"INFO: Loading ALL {len(dataset_names)} datasets from group for '{param_name}'", file=sys.stderr)

        # Load all datasets and collect them
        all_datasets: Dict[str, pd.DataFrame] = {}
        all_columns: set = set()

        for ds_name in dataset_names:
            try:
                ext_df = None
                if group_id.startswith('datasource_'):
                    # Data source group - load directly from CSV file
                    csv_path = os.path.join(os.getcwd(), 'data', 'csv', ds_name)
                    if not os.path.exists(csv_path):
                        continue
                    ext_df = pd.read_csv(csv_path)
                else:
                    # Custom group
                    group_name = group_id_to_name.get(group_id)
                    if group_name:
                        ext_df = self.load_dataset_from_group(group_name, ds_name)

                if ext_df is None or ext_df.empty:
                    continue

                # Prepare for merging
                if 'date' in ext_df.columns:
                    ext_df['date'] = pd.to_datetime(ext_df['date'])
                    ext_df.set_index('date', drop=True, inplace=True)

                # Normalize date index
                if isinstance(ext_df.index, pd.DatetimeIndex):
                    if ext_df.index.tz is not None:
                        ext_df.index = pd.DatetimeIndex(ext_df.index.date)
                    else:
                        ext_df.index = ext_df.index.normalize()

                # Store dataset with clean name (remove .csv extension)
                clean_name = ds_name.replace('.csv', '')
                all_datasets[clean_name] = ext_df
                all_columns.update(ext_df.columns)

            except Exception as e:
                warnings.warn(f"Failed to load dataset '{ds_name}': {e}")
                continue

        if not all_datasets:
            warnings.warn(f"No datasets could be loaded for parameter '{param_name}'")
            return result_df

        # Normalize result_df index
        if isinstance(result_df.index, pd.DatetimeIndex):
            if result_df.index.tz is not None:
                result_df.index = pd.DatetimeIndex(result_df.index.date)
            else:
                result_df.index = result_df.index.normalize()

        # For each column, create an array column containing all dataset values for each row
        # data['param@col'] returns an array of values from all datasets for that date
        for col_name in all_columns:
            array_col_name = f'{param_name}@{col_name}'

            # Build array for each row in result_df
            array_values = []
            for idx in result_df.index:
                row_array = []
                for ds_name, ds_df in all_datasets.items():
                    if col_name in ds_df.columns and idx in ds_df.index:
                        value = ds_df.loc[idx, col_name]
                        # Handle NaN values
                        if pd.isna(value):
                            row_array.append(None)
                        else:
                            row_array.append(value)
                array_values.append(row_array)

            result_df[array_col_name] = array_values

        print(f"INFO: Created {len(all_columns)} array columns from {len(all_datasets)} datasets for '{param_name}'", file=sys.stderr)

        return result_df

    def prepare_dataframe(
        self,
        data_records: List[Dict[str, Any]],
        external_datasets_config: Optional[Dict[str, Dict[str, str]]] = None
    ) -> pd.DataFrame:
        """
        Prepare DataFrame from records with date normalization and external dataset merging.

        Args:
            data_records: List of data records
            external_datasets_config: Optional external datasets configuration

        Returns:
            Prepared DataFrame with normalized dates and merged external datasets
        """
        # Convert to pandas DataFrame
        df = pd.DataFrame(data_records)

        # Convert date strings to datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            # Set date as index for merging
            df.set_index('date', drop=False, inplace=True)
            # Normalize to date-only for consistent matching
            # Extract date component as displayed to avoid timezone conversion
            if isinstance(df.index, pd.DatetimeIndex):
                if df.index.tz is not None:
                    # Extract date component (year, month, day) as displayed
                    # E.g., 1999-11-10T00:00:00.000+00:00 → 1999-11-10
                    df.index = pd.DatetimeIndex(df.index.date)
                else:
                    df.index = df.index.normalize()

        # Load and merge external datasets
        if external_datasets_config:
            import sys
            print(f"INFO: External datasets config: {external_datasets_config}", file=sys.stderr)
            df = self.load_and_merge_external_datasets(df, external_datasets_config)
            print(f"INFO: After merge, columns: {list(df.columns)}", file=sys.stderr)

        return df

    def build_error_output(
        self,
        exception: Exception,
        user_code_context: Optional[str] = None,
        additional_info: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Build standardized error output with warnings.

        Args:
            exception: The exception that occurred
            user_code_context: Optional user code line that caused error
            additional_info: Optional list of helpful hints

        Returns:
            Error output dictionary
        """
        import traceback

        error_type = type(exception).__name__
        error_msg = str(exception)
        tb_lines = traceback.format_exc().split('\n')

        output = {
            'success': False,
            'error': error_msg,
            'type': error_type,
            'details': {
                'message': error_msg,
                'type': error_type,
                'traceback': '\n'.join(tb_lines[-10:]),  # Last 10 lines
            }
        }

        if user_code_context:
            output['details']['code_line'] = user_code_context

        if additional_info:
            output['details']['hints'] = additional_info

        # Add captured warnings if any
        if self.captured_warnings:
            output['details']['warnings'] = self.captured_warnings

        return output
