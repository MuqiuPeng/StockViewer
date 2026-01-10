#!/usr/bin/env python3
"""
Python indicator executor wrapper.
Reads JSON from stdin, executes user code, outputs JSON to stdout.
"""
import sys
import os
import json
import warnings
import pandas as pd
import numpy as np

# Add MyTT.py to sys.path so it can be imported
sys.path.insert(0, os.path.dirname(__file__))
import MyTT


# Global cache for loaded datasets to avoid repeated file I/O
_dataset_cache = {}
_group_cache = {}


def load_group_definition(group_name: str) -> dict:
    """
    Load a group definition from groups.json.

    Args:
        group_name: Name of the group to load

    Returns:
        Group definition dictionary
    """
    # Check cache first
    if group_name in _group_cache:
        return _group_cache[group_name]

    # Load groups.json
    groups_file = os.path.join(os.getcwd(), 'data', 'groups', 'groups.json')

    if not os.path.exists(groups_file):
        raise FileNotFoundError(f"Groups file not found: {groups_file}")

    with open(groups_file, 'r', encoding='utf-8') as f:
        groups_data = json.load(f)

    # Find the group by name
    for group in groups_data.get('groups', []):
        if group['name'] == group_name:
            _group_cache[group_name] = group
            return group

    raise ValueError(f"Group '{group_name}' not found in groups.json")


def load_dataset_from_group(group_name: str, dataset_identifier: str) -> pd.DataFrame:
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
    if cache_key in _dataset_cache:
        return _dataset_cache[cache_key].copy()

    # Load group definition
    group = load_group_definition(group_name)

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
    _dataset_cache[cache_key] = df.copy()

    return df


def load_and_merge_external_datasets(main_df: pd.DataFrame, external_datasets_config: dict) -> pd.DataFrame:
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
                ext_df = load_dataset_from_group(group_name, dataset_name)

            if ext_df is None or ext_df.empty:
                warnings.warn(f"External dataset '{param_name}' is empty, skipping")
                continue

            # Prepare external dataset for merging
            if 'date' in ext_df.columns:
                ext_df['date'] = pd.to_datetime(ext_df['date'])
                ext_df.set_index('date', drop=True, inplace=True)

            # Normalize date indices to date-only (remove time component) for reliable matching
            # This ensures dates in different formats (e.g., "2024-01-01" vs "2024-01-01 00:00:00") match correctly
            if isinstance(result_df.index, pd.DatetimeIndex):
                result_df.index = result_df.index.normalize()
            if isinstance(ext_df.index, pd.DatetimeIndex):
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
            traceback.print_exc(file=sys.stderr)
            continue

    return result_df


def merge_external_datasets(main_df: pd.DataFrame, external_datasets: dict) -> pd.DataFrame:
    """
    Merge external datasets into the main dataframe by left joining on date.
    Columns from external datasets are renamed to {dataset_name}@{column_name}.

    Args:
        main_df: Main DataFrame with date index
        external_datasets: Dict mapping dataset names to DataFrames

    Returns:
        DataFrame with external datasets merged in
    """
    if not external_datasets:
        return main_df

    # Create a copy to avoid modifying the original
    result_df = main_df.copy()

    for dataset_name, ext_df in external_datasets.items():
        if ext_df is None or ext_df.empty:
            print(f"WARNING: External dataset '{dataset_name}' is empty, skipping merge", file=sys.stderr)
            continue

        try:
            # Ensure external dataset has date as index
            ext_df_copy = ext_df.copy()
            if 'date' in ext_df_copy.columns and not isinstance(ext_df_copy.index, pd.DatetimeIndex):
                ext_df_copy['date'] = pd.to_datetime(ext_df_copy['date'])
                ext_df_copy.set_index('date', drop=True, inplace=True)

            # Rename all columns to {dataset_name}@{column_name}
            renamed_cols = {col: f'{dataset_name}@{col}' for col in ext_df_copy.columns}
            ext_df_copy.rename(columns=renamed_cols, inplace=True)

            # Left join on date index
            result_df = result_df.join(ext_df_copy, how='left')

            print(f"INFO: Merged external dataset '{dataset_name}' with {len(renamed_cols)} columns", file=sys.stderr)

        except Exception as e:
            print(f"WARNING: Failed to merge external dataset '{dataset_name}': {e}", file=sys.stderr)
            continue

    return result_df


def main():
    # Capture warnings
    captured_warnings = []

    def warning_handler(message, category, filename, lineno, file=None, line=None):
        captured_warnings.append(str(message))

    old_showwarning = warnings.showwarning
    warnings.showwarning = warning_handler

    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)

        # Extract components
        user_code = input_data['code']
        data_records = input_data['data']
        is_group = input_data.get('isGroup', False)

        # Convert to pandas DataFrame
        df = pd.DataFrame(data_records)

        # Convert date strings to datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            # Set date as index for merging
            df.set_index('date', drop=False, inplace=True)
            # Normalize to date-only for consistent matching
            df.index = df.index.normalize()

        # Load and merge external datasets
        external_datasets_config = input_data.get('externalDatasets', {})
        print(f"INFO: External datasets config: {external_datasets_config}", file=sys.stderr)
        if external_datasets_config:
            df = load_and_merge_external_datasets(df, external_datasets_config)
            print(f"INFO: After merge, columns: {list(df.columns)}", file=sys.stderr)

        # Create empty parameters dict for backward compatibility
        parameters = {}

        # Execute user code in isolated namespace with MyTT
        namespace = {
            'pd': pd,
            'np': np,
            'data': df,
            'MyTT': MyTT,
            # Make MyTT functions available directly
            **{name: getattr(MyTT, name) for name in dir(MyTT) if not name.startswith('_')}
        }

        # User code must define a calculate function
        exec(user_code, namespace)

        if 'calculate' not in namespace:
            raise ValueError("User code must define a 'calculate(data)' or 'calculate(data, parameters)' function")

        # Execute the calculate function
        # Support both calculate(data) and calculate(data, parameters) signatures
        import inspect
        calculate_func = namespace['calculate']

        result = calculate_func(df)

        if is_group:
            # Group indicators must return a dict
            if not isinstance(result, dict):
                raise ValueError("Group indicators must return dict of {indicator_name: values}")

            # Validate all values are arrays of correct length
            output_values = {}
            for key, values in result.items():
                # Convert to list
                if isinstance(values, pd.Series):
                    values_list = values.tolist()
                elif isinstance(values, np.ndarray):
                    values_list = values.tolist()
                elif isinstance(values, list):
                    values_list = values
                else:
                    raise ValueError(f"Unsupported value type for '{key}': {type(values)}")

                # Validate length
                if len(values_list) != len(df):
                    raise ValueError(f"'{key}': length mismatch ({len(values_list)} != {len(df)})")

                # Convert NaN to null for JSON
                values_list = [None if (isinstance(v, float) and np.isnan(v)) else v for v in values_list]
                output_values[key] = values_list

            # Output results
            output = {
                'success': True,
                'values': output_values
            }
            print(json.dumps(output))
        else:
            # Single indicator mode (existing logic)
            # Convert result to list
            if isinstance(result, pd.Series):
                result_list = result.tolist()
            elif isinstance(result, np.ndarray):
                result_list = result.tolist()
            elif isinstance(result, list):
                result_list = result
            else:
                raise ValueError(f"Unsupported return type: {type(result)}")

            # Validate length
            if len(result_list) != len(df):
                raise ValueError(f"Result length ({len(result_list)}) must match data length ({len(df)})")

            # Convert NaN to null for JSON
            result_list = [None if (isinstance(v, float) and np.isnan(v)) else v for v in result_list]

            # Output results
            output = {
                'success': True,
                'values': result_list
            }
            print(json.dumps(output))

    except Exception as e:
        # Build detailed error message
        error_type = type(e).__name__
        error_msg = str(e)

        # Get traceback
        import traceback
        tb_lines = traceback.format_exc().split('\n')

        # Try to extract user code line from traceback
        user_code_context = None
        for i, line in enumerate(tb_lines):
            if 'File "<string>"' in line:
                # Found user code execution, get the next line with actual error
                if i + 1 < len(tb_lines):
                    user_code_context = tb_lines[i + 1].strip()
                break

        # Add helpful context for common errors
        additional_info = []

        if error_type == 'KeyError':
            # Column access error - show available columns
            try:
                available_cols = list(df.columns) if 'df' in locals() else []
                if available_cols:
                    additional_info.append(f"Available columns: {', '.join(available_cols)}")
                    # Check if error is about missing external dataset column
                    if '@' in error_msg:
                        additional_info.append("Hint: External dataset columns use format 'dataset_name@column_name'")
                        additional_info.append("Make sure you configured external datasets in the indicator settings")
            except:
                pass

        elif error_type == 'AttributeError':
            additional_info.append("Hint: Check that you're using the correct pandas/numpy methods")

        elif error_type == 'ValueError' and 'length' in error_msg.lower():
            try:
                additional_info.append(f"Data has {len(df)} rows")
            except:
                pass

        # Build detailed error output
        output = {
            'success': False,
            'error': error_msg,
            'type': error_type,
            'details': {
                'message': error_msg,
                'type': error_type,
                'traceback': '\n'.join(tb_lines[-10:]),  # Last 10 lines of traceback
            }
        }

        if user_code_context:
            output['details']['code_line'] = user_code_context

        if additional_info:
            output['details']['hints'] = additional_info

        # Add captured warnings if any
        if captured_warnings:
            output['details']['warnings'] = captured_warnings

        print(json.dumps(output))
        sys.exit(1)
    finally:
        # Restore original warning handler
        warnings.showwarning = old_showwarning

if __name__ == '__main__':
    main()
