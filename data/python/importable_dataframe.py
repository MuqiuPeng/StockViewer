#!/usr/bin/env python3
"""
ImportableDataFrame - A DataFrame wrapper that supports dynamic imports of
subscribed indicators and datasets.
"""
import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Union


class ImportableDataFrame:
    """
    A wrapper around pandas DataFrame that supports dynamic imports
    of subscribed indicators and datasets.

    This allows users to call data.import_('RSI') to import indicator values
    or data.import_('000001', type='dataset') to import another dataset's data.

    Example:
        def calculate(data):
            # Import my own indicator
            rsi = data.import_('RSI')

            # Import another user's indicator by email
            bob_rsi = data.import_(user='bob@example.com', indicator='RSI')

            # Import a different dataset (e.g., index data)
            index = data.import_('000001', type='dataset')

            # Use imported data
            return (data['close'] > rsi['value']).astype(int)
    """

    def __init__(
        self,
        df: pd.DataFrame,
        resource_manifest: Dict[str, Dict[str, Any]],
        preloaded_indicators: Dict[str, List[Dict[str, Any]]],
        preloaded_datasets: Dict[str, List[Dict[str, Any]]]
    ):
        """
        Initialize ImportableDataFrame.

        Args:
            df: The underlying pandas DataFrame with price data
            resource_manifest: Dict with 'indicators' and 'datasets' keys,
                              mapping names to resource info
            preloaded_indicators: Dict mapping indicator names to their values
            preloaded_datasets: Dict mapping dataset names to their records
        """
        self._df = df
        self._manifest = resource_manifest or {'indicators': {}, 'datasets': {}}
        self._preloaded_indicators = preloaded_indicators or {}
        self._preloaded_datasets = preloaded_datasets or {}
        self._import_cache: Dict[str, pd.DataFrame] = {}

    # DataFrame delegation methods
    def __getattr__(self, name: str) -> Any:
        """Delegate attribute access to underlying DataFrame."""
        return getattr(self._df, name)

    def __getitem__(self, key: Any) -> Any:
        """Delegate item access to underlying DataFrame."""
        return self._df[key]

    def __setitem__(self, key: Any, value: Any) -> None:
        """Delegate item setting to underlying DataFrame."""
        self._df[key] = value

    def __len__(self) -> int:
        """Return length of underlying DataFrame."""
        return len(self._df)

    def __repr__(self) -> str:
        """Return string representation."""
        return f"ImportableDataFrame({len(self._df)} rows, {len(self._df.columns)} columns)"

    @property
    def columns(self) -> pd.Index:
        """Return columns of underlying DataFrame."""
        return self._df.columns

    @property
    def index(self) -> pd.Index:
        """Return index of underlying DataFrame."""
        return self._df.index

    @property
    def shape(self) -> tuple:
        """Return shape of underlying DataFrame."""
        return self._df.shape

    @property
    def values(self) -> np.ndarray:
        """Return values of underlying DataFrame."""
        return self._df.values

    @property
    def dtypes(self) -> pd.Series:
        """Return dtypes of underlying DataFrame."""
        return self._df.dtypes

    def import_(
        self,
        name: Optional[str] = None,
        *,
        user: Optional[str] = None,
        indicator: Optional[str] = None,
        type: Optional[str] = None,
        columns: Optional[List[str]] = None
    ) -> pd.DataFrame:
        """
        Import a subscribed indicator or dataset.

        Args:
            name: Name of the indicator or dataset to import (positional, for backward compat)
            user: Email of the user whose indicator to import (keyword-only)
            indicator: Name of the indicator to import (keyword-only, alternative to positional name)
            type: Optional type hint ('indicator' or 'dataset').
                  If not specified, indicators are checked first, then datasets.
            columns: Optional list of columns to return (for datasets).
                     If None, all columns are returned.

        Returns:
            DataFrame with the imported data, indexed by date.
            For indicators: contains 'value' column (or multiple for group indicators).
            For datasets: contains all OHLCV columns.

        Raises:
            KeyError: If resource is not found in user's accessible resources
            ValueError: If resource data is not preloaded

        Example:
            # Import my own indicator
            rsi = data.import_('RSI')
            print(rsi['value'])  # Access the indicator values

            # Import another user's indicator by email
            bob_rsi = data.import_(user='bob@example.com', indicator='RSI')

            # Import another dataset
            index = data.import_('000001', type='dataset')
            print(index['close'])  # Access the close prices

            # Import specific columns only
            spy = data.import_('SPY', type='dataset', columns=['close', 'volume'])
        """
        # Resolve the indicator/resource name
        resource_name = indicator or name
        if not resource_name:
            raise ValueError("Must provide either 'name' (positional) or 'indicator' (keyword) argument")

        # Check cache first
        cache_key = f"{type or 'auto'}:{user or ''}:{resource_name}"
        if cache_key in self._import_cache:
            result = self._import_cache[cache_key]
            if columns:
                available = [c for c in columns if c in result.columns]
                return result[available]
            return result

        # Resolve name to resource
        resource = self._resolve_resource(resource_name, type, user)

        if resource is None:
            if user:
                raise KeyError(
                    f"Indicator '{resource_name}' from user '{user}' not found in your accessible resources.\n"
                    f"Make sure you have subscribed to this indicator."
                )
            available_ind = list(self._manifest.get('indicators', {}).keys())
            available_ds = list(self._manifest.get('datasets', {}).keys())
            raise KeyError(
                f"Resource '{resource_name}' not found in your accessible resources.\n"
                f"Available indicators: {available_ind[:10]}{'...' if len(available_ind) > 10 else ''}\n"
                f"Available datasets: {available_ds[:10]}{'...' if len(available_ds) > 10 else ''}"
            )

        # Load based on resource type
        resource_type = resource.get('type', 'indicator')
        # Use the key from resource if available (for user-specific lookups)
        lookup_key = resource.get('_key') or resource_name
        if resource_type == 'indicator':
            result = self._load_indicator(lookup_key, resource)
        else:
            result = self._load_dataset(lookup_key, resource)

        # Cache the result
        self._import_cache[cache_key] = result

        # Apply column filter if specified
        if columns:
            available = [c for c in columns if c in result.columns]
            return result[available]
        return result

    def _resolve_resource(
        self,
        name: str,
        type_hint: Optional[str] = None,
        user_email: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Resolve a name to a resource, using type hint and user email if provided.

        Args:
            name: Resource name to resolve
            type_hint: Optional type hint ('indicator' or 'dataset')
            user_email: Optional user email to find specific user's indicator

        Returns:
            Resource info dict with 'type' key, or None if not found
        """
        indicators = self._manifest.get('indicators', {})
        datasets = self._manifest.get('datasets', {})

        if user_email:
            # Look for indicator by user email + name
            # Manifest keys for user-specific indicators are "{email}:{name}"
            user_key = f"{user_email}:{name}"
            if user_key in indicators:
                return {**indicators[user_key], 'type': 'indicator'}
            # Also check if any indicator matches by creatorEmail field
            for key, info in indicators.items():
                if info.get('creatorEmail') == user_email and info.get('name') == name:
                    return {**info, 'type': 'indicator', '_key': key}
            return None

        if type_hint == 'indicator':
            if name in indicators:
                return {**indicators[name], 'type': 'indicator'}
            return None
        elif type_hint == 'dataset':
            if name in datasets:
                return {**datasets[name], 'type': 'dataset'}
            return None
        else:
            # Auto-detect: try indicators first, then datasets
            if name in indicators:
                return {**indicators[name], 'type': 'indicator'}
            if name in datasets:
                return {**datasets[name], 'type': 'dataset'}
            return None

    def _load_indicator(
        self,
        name: str,
        resource: Dict[str, Any]
    ) -> pd.DataFrame:
        """
        Load indicator values from preloaded data.

        Args:
            name: Indicator name
            resource: Resource info from manifest

        Returns:
            DataFrame with indicator values indexed by date
        """
        if name not in self._preloaded_indicators:
            raise ValueError(
                f"Indicator '{name}' is in your collection but data is not preloaded. "
                f"This may require computing the indicator for this stock first."
            )

        indicator_data = self._preloaded_indicators[name]

        if not indicator_data:
            raise ValueError(f"Indicator '{name}' has no data for this stock.")

        df = pd.DataFrame(indicator_data)

        # Set date as index for alignment
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            # Normalize index
            if df.index.tz is not None:
                df.index = pd.DatetimeIndex(df.index.date)
            else:
                df.index = df.index.normalize()

        return df

    def _load_dataset(
        self,
        name: str,
        resource: Dict[str, Any]
    ) -> pd.DataFrame:
        """
        Load dataset from preloaded data.

        Args:
            name: Dataset name (symbol/code)
            resource: Resource info from manifest

        Returns:
            DataFrame with OHLCV data indexed by date
        """
        if name not in self._preloaded_datasets:
            raise ValueError(
                f"Dataset '{name}' is in your collection but data is not preloaded."
            )

        dataset_records = self._preloaded_datasets[name]

        if not dataset_records:
            raise ValueError(f"Dataset '{name}' has no data.")

        df = pd.DataFrame(dataset_records)

        # Set date as index for alignment
        if 'date' in df.columns:
            df['date'] = pd.to_datetime(df['date'])
            df.set_index('date', inplace=True)
            # Normalize index
            if df.index.tz is not None:
                df.index = pd.DatetimeIndex(df.index.date)
            else:
                df.index = df.index.normalize()

        return df

    def list_available(self, type: Optional[str] = None) -> List[str]:
        """
        List available resources that can be imported.

        Args:
            type: Optional filter by type ('indicator' or 'dataset')

        Returns:
            Sorted list of available resource names

        Example:
            # List all available resources
            print(data.list_available())

            # List only indicators
            print(data.list_available(type='indicator'))

            # List only datasets
            print(data.list_available(type='dataset'))
        """
        result = []

        if type is None or type == 'indicator':
            result.extend(self._manifest.get('indicators', {}).keys())

        if type is None or type == 'dataset':
            result.extend(self._manifest.get('datasets', {}).keys())

        return sorted(set(result))

    def list_preloaded(self, type: Optional[str] = None) -> List[str]:
        """
        List resources that are preloaded and ready to import without errors.

        Args:
            type: Optional filter by type ('indicator' or 'dataset')

        Returns:
            Sorted list of preloaded resource names
        """
        result = []

        if type is None or type == 'indicator':
            result.extend(self._preloaded_indicators.keys())

        if type is None or type == 'dataset':
            result.extend(self._preloaded_datasets.keys())

        return sorted(set(result))
