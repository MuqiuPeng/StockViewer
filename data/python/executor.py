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
            raise ValueError("User code must define a 'calculate(data)' function")

        # Execute the calculate function
        result = namespace['calculate'](df)

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
