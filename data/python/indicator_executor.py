#!/usr/bin/env python3
"""
Indicator executor - executes user-defined indicator code.
"""
import sys
import json
import pandas as pd
import numpy as np
import inspect
from typing import Dict, Any, List, Union

from base_executor import BaseExecutor

# Add MyTT.py to sys.path so it can be imported
import os
sys.path.insert(0, os.path.dirname(__file__))
import MyTT


class IndicatorExecutor(BaseExecutor):
    """Executor for running user-defined indicator calculations."""

    def __init__(self):
        """Initialize indicator executor."""
        super().__init__()

    def execute_indicator(
        self,
        user_code: str,
        data_records: List[Dict[str, Any]],
        is_group: bool = False,
        external_datasets_config: Dict[str, Dict[str, str]] = None
    ) -> Dict[str, Any]:
        """
        Execute indicator code and return results.

        Args:
            user_code: Python code defining calculate function
            data_records: Data records to process
            is_group: Whether this is a group indicator (returns dict)
            external_datasets_config: Optional external datasets configuration

        Returns:
            Execution result with success status and values
        """
        try:
            # Prepare dataframe
            df = self.prepare_dataframe(data_records, external_datasets_config)

            # Create empty parameters dict for backward compatibility
            parameters = {}

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
            calculate_func = namespace['calculate']
            sig = inspect.signature(calculate_func)

            if len(sig.parameters) >= 2:
                # Function accepts parameters argument
                result = calculate_func(df, parameters)
            else:
                # Function only accepts data argument (backward compatibility)
                result = calculate_func(df)

            if is_group:
                return self._process_group_result(result, df)
            else:
                return self._process_single_result(result, df)

        except Exception as e:
            return self._handle_indicator_error(e, df if 'df' in locals() else None)

    def _process_group_result(
        self,
        result: Any,
        df: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Process group indicator result (dict of values).

        Args:
            result: Result from calculate function (should be dict)
            df: Input dataframe

        Returns:
            Success output with values dict
        """
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

        return {
            'success': True,
            'values': output_values
        }

    def _process_single_result(
        self,
        result: Any,
        df: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Process single indicator result.

        Args:
            result: Result from calculate function
            df: Input dataframe

        Returns:
            Success output with values list
        """
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

        return {
            'success': True,
            'values': result_list
        }

    def _handle_indicator_error(
        self,
        exception: Exception,
        df: pd.DataFrame = None
    ) -> Dict[str, Any]:
        """
        Handle indicator execution error and build error output.

        Args:
            exception: The exception that occurred
            df: Optional dataframe for context

        Returns:
            Error output dictionary
        """
        import traceback

        error_type = type(exception).__name__
        error_msg = str(exception)

        # Get traceback
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
                if df is not None:
                    available_cols = list(df.columns)
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
                if df is not None:
                    additional_info.append(f"Data has {len(df)} rows")
            except:
                pass

        return self.build_error_output(exception, user_code_context, additional_info)

    def run_from_stdin(self) -> None:
        """
        Run indicator executor reading input from stdin and writing output to stdout.
        This is the main entry point when called from Node.js.
        """
        self.setup_warning_capture()

        try:
            # Read input from stdin
            input_data = json.load(sys.stdin)

            # Extract components
            user_code = input_data['code']
            data_records = input_data['data']
            is_group = input_data.get('isGroup', False)
            external_datasets_config = input_data.get('externalDatasets', {})

            # Execute indicator
            result = self.execute_indicator(
                user_code,
                data_records,
                is_group,
                external_datasets_config
            )

            # Output results
            print(json.dumps(result))

        except Exception as e:
            # Handle top-level errors
            output = self.build_error_output(e)
            print(json.dumps(output))
            sys.exit(1)

        finally:
            self.restore_warning_handler()


if __name__ == '__main__':
    executor = IndicatorExecutor()
    executor.run_from_stdin()
