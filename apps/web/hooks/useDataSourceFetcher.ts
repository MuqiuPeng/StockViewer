'use client';

import { useState, useEffect } from 'react';
import type { ImportableIndicator, ImportableItem, ImportableDatasetColumn } from '@/components/editor/types';
import { BASE_COLUMNS } from '@/components/editor/placeholder-utils';

interface StockGroup {
  id: string;
  name: string;
  stockIds: string[];
  isDataSource?: boolean;
  dataSourceName?: string;
}

interface DataSourceFetcherResult {
  indicators: ImportableIndicator[];
  importableItems: ImportableItem[];
  datasetColumns: ImportableDatasetColumn[];
  groups: StockGroup[];
  isLoading: boolean;
}

export function useDataSourceFetcher(isOpen: boolean): DataSourceFetcherResult {
  const [indicators, setIndicators] = useState<ImportableIndicator[]>([]);
  const [importableItems, setImportableItems] = useState<ImportableItem[]>([]);
  const [datasetColumns, setDatasetColumns] = useState<ImportableDatasetColumn[]>([]);
  const [groups, setGroups] = useState<StockGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);

    Promise.all([
      fetch('/api/indicators').then(res => res.json()),
      fetch('/api/datasets').then(res => res.json()),
      fetch('/api/groups').then(res => res.json()),
    ])
      .then(([indicatorsData, datasetsData, groupsData]) => {
        // Process indicators
        let processedIndicators: ImportableIndicator[] = [];
        if (indicatorsData.indicators) {
          processedIndicators = indicatorsData.indicators.map((ind: any) => ({
            id: ind.id,
            name: ind.name,
            ownerEmail: ind.creatorEmail || 'me',
            description: ind.description || '',
            isOwner: ind.isOwner,
            outputColumn: ind.outputColumn,
            isGroup: ind.isGroup,
            groupName: ind.groupName,
            expectedOutputs: ind.expectedOutputs,
          }));
          setIndicators(processedIndicators);

          // Build flattened importable items
          const items: ImportableItem[] = [];
          for (const ind of processedIndicators) {
            if (ind.isGroup && ind.expectedOutputs && ind.expectedOutputs.length > 0) {
              for (const output of ind.expectedOutputs) {
                items.push({
                  id: `${ind.id}:${output}`,
                  indicatorName: ind.name,
                  columnName: output,
                  displayName: `${ind.name}:${output}`,
                  ownerEmail: ind.ownerEmail,
                  isOwner: ind.isOwner,
                  isGroupColumn: true,
                });
              }
            } else {
              items.push({
                id: ind.id,
                indicatorName: ind.name,
                columnName: 'value',
                displayName: ind.name,
                ownerEmail: ind.ownerEmail,
                isOwner: ind.isOwner,
                isGroupColumn: false,
              });
            }
          }
          setImportableItems(items);
        }

        // Process datasets
        if (datasetsData?.datasets) {
          const dsColumns: ImportableDatasetColumn[] = [];
          for (const ds of datasetsData.datasets) {
            for (const col of BASE_COLUMNS) {
              dsColumns.push({
                datasetSymbol: ds.code,
                datasetName: ds.name || ds.code,
                column: col,
                displayName: `${ds.code}@${col}`,
              });
            }
            // Add indicator columns for each dataset
            for (const ind of processedIndicators) {
              if (ind.isGroup && ind.expectedOutputs && ind.expectedOutputs.length > 0) {
                for (const output of ind.expectedOutputs) {
                  dsColumns.push({
                    datasetSymbol: ds.code,
                    datasetName: ds.name || ds.code,
                    column: `${ind.name}:${output}`,
                    displayName: `${ds.code}@${ind.name}:${output}`,
                  });
                }
              } else {
                dsColumns.push({
                  datasetSymbol: ds.code,
                  datasetName: ds.name || ds.code,
                  column: ind.name,
                  displayName: `${ds.code}@${ind.name}`,
                });
              }
            }
          }
          setDatasetColumns(dsColumns);
        }

        // Process groups
        if (groupsData?.groups) {
          setGroups(groupsData.groups);
        }
      })
      .catch(err => {
        console.error('Failed to load data sources:', err);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isOpen]);

  return { indicators, importableItems, datasetColumns, groups, isLoading };
}
