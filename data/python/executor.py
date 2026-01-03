#!/usr/bin/env python3
"""
Python indicator executor wrapper.
Reads JSON from stdin, executes user code, outputs JSON to stdout.
"""
import sys
import json
import pandas as pd
import numpy as np

def main():
    try:
        # Read input from stdin
        input_data = json.load(sys.stdin)

        # Extract components
        user_code = input_data['code']
        data_records = input_data['data']

        # Convert to pandas DataFrame
        df = pd.DataFrame(data_records)

        # Convert date strings to datetime
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])

        # Execute user code in isolated namespace
        namespace = {
            'pd': pd,
            'np': np,
            'data': df
        }

        # User code must define a calculate function
        exec(user_code, namespace)

        if 'calculate' not in namespace:
            raise ValueError("User code must define a 'calculate(data)' function")

        # Execute the calculate function
        result = namespace['calculate'](df)

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
