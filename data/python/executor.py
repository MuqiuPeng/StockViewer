#!/usr/bin/env python3
"""
Python indicator executor wrapper.
Reads JSON from stdin, executes user code, outputs JSON to stdout.
"""
import sys
import os
import json
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


def load_external_datasets(external_datasets_config: dict) -> dict:
    """
    Load external datasets based on configuration.

    Args:
        external_datasets_config: Dict mapping parameter names to dataset configs
                                   Format: {param_name: {groupId: str, datasetName: str}}

    Returns:
        Dict mapping parameter names to DataFrames

    Example:
        config = {'index_data': {'groupId': 'group-123', 'datasetName': '000001.csv'}}
        result = load_external_datasets(config)
        # result = {'index_data': DataFrame(...)}
    """
    if not external_datasets_config:
        return {}

    result = {}

    # First, load groups.json to resolve group IDs to group names
    groups_file = os.path.join(os.getcwd(), 'data', 'groups', 'groups.json')
    if not os.path.exists(groups_file):
        print(f"WARNING: groups.json not found, skipping external datasets", file=sys.stderr)
        return {}

    with open(groups_file, 'r', encoding='utf-8') as f:
        groups_data = json.load(f)

    # Create mapping from group ID to group name
    group_id_to_name = {}
    for group in groups_data.get('groups', []):
        group_id_to_name[group['id']] = group['name']

    # Load each external dataset
    for param_name, dataset_config in external_datasets_config.items():
        try:
            group_id = dataset_config.get('groupId')
            dataset_name = dataset_config.get('datasetName')

            if not group_id or not dataset_name:
                print(f"WARNING: Skipping incomplete external dataset config for '{param_name}'", file=sys.stderr)
                continue

            # Resolve group ID to group name
            group_name = group_id_to_name.get(group_id)
            if not group_name:
                print(f"WARNING: Group ID '{group_id}' not found for parameter '{param_name}'", file=sys.stderr)
                continue

            # Load the dataset
            df = load_dataset_from_group(group_name, dataset_name)
            result[param_name] = df

        except Exception as e:
            print(f"WARNING: Failed to load external dataset '{param_name}': {e}", file=sys.stderr)
            continue

    return result


def main():
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

        # Load external datasets and create parameters dict
        external_datasets_config = input_data.get('externalDatasets', {})
        parameters = {}
        if external_datasets_config:
            external_datasets = load_external_datasets(external_datasets_config)
            parameters.update(external_datasets)

        # Execute user code in isolated namespace with MyTT
        namespace = {
            'pd': pd,
            'np': np,
            'data': df,
            'MyTT': MyTT,
            'parameters': parameters,
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
        sig = inspect.signature(calculate_func)

        if len(sig.parameters) >= 2:
            # Function accepts parameters argument
            result = calculate_func(df, parameters)
        else:
            # Function only accepts data argument (backward compatibility)
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
        # Output error
        output = {
            'success': False,
            'error': str(e),
            'type': type(e).__name__
        }
        print(json.dumps(output))
        sys.exit(1)

if __name__ == '__main__':
    main()
