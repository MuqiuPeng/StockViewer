#!/usr/bin/env python3
"""
Python indicator executor wrapper.
Reads JSON from stdin, executes user code, outputs JSON to stdout.

This is a backward-compatible wrapper around IndicatorExecutor.
"""
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

from indicator_executor import IndicatorExecutor

if __name__ == '__main__':
    executor = IndicatorExecutor()
    executor.run_from_stdin()
