import type { PortfolioConstraints } from './portfolio';

/**
 * A user-authored strategy: Python that produces entry and exit signals.
 */
export interface Strategy {
  id: string;
  name: string;
  description: string;
  pythonCode: string;
  strategyType: 'signal' | 'portfolio';  // Strategy type
  constraints?: PortfolioConstraints;     // Portfolio constraints (only for portfolio type)
  parameters?: Record<string, any>;      // Configurable parameters
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;  // External datasets
  dependencies?: string[];               // Indicator names/IDs this strategy depends on
  createdAt: string;
  updatedAt?: string;
  isOwner?: boolean;                     // Whether current user is the creator
}
