#!/usr/bin/env python3
"""
Run all test suites for Python executor functionality.
"""
import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(__file__))

# Import test modules
import test_external_datasets
import test_warning_capture
import test_integration


def main():
    """Run all test suites and report results."""
    print("="*70)
    print("RUNNING ALL PYTHON EXECUTOR TESTS")
    print("="*70)
    print()

    results = []

    # Run external datasets tests
    print("\n" + "="*70)
    print("1. EXTERNAL DATASETS TESTS")
    print("="*70)
    success1 = test_external_datasets.run_tests()
    results.append(("External Datasets", success1))

    # Run warning capture tests
    print("\n" + "="*70)
    print("2. WARNING CAPTURE TESTS")
    print("="*70)
    success2 = test_warning_capture.run_tests()
    results.append(("Warning Capture", success2))

    # Run integration tests
    print("\n" + "="*70)
    print("3. INTEGRATION TESTS")
    print("="*70)
    success3 = test_integration.run_tests()
    results.append(("Integration", success3))

    # Print overall summary
    print("\n" + "="*70)
    print("OVERALL TEST RESULTS")
    print("="*70)

    all_passed = True
    for suite_name, success in results:
        status = "✓ PASSED" if success else "✗ FAILED"
        print(f"{suite_name:.<50} {status}")
        if not success:
            all_passed = False

    print("="*70)

    if all_passed:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("\n❌ SOME TESTS FAILED")
        return 1


if __name__ == '__main__':
    exit_code = main()
    sys.exit(exit_code)
