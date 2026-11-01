// Graph model builder with connected components

import { GraphNode, GraphEdge, GraphModel, NodeType } from './types';

interface RawIndicator {
  id: string;
  name: string;
  outputColumn: string;
  dependencies?: string[];
  dependencyColumns?: string[];
  isGroup?: boolean;
  groupName?: string;
  expectedOutputs?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
}

interface RawStrategy {
  id: string;
  name: string;
  dependencies?: string[];
  dependencyColumns?: string[];
  externalDatasets?: Record<string, { groupId: string; datasetName: string }>;
}

interface RawDataset {
  id: string;
  symbol: string;
  name: string;
}

/**
 * Build graph model from raw indicators and strategies data.
 * Resolves dependencies by name/id/outputColumn and computes connected components.
 * Places each connected component in separate regions.
 */
export function buildGraphModel(
  indicators: RawIndicator[],
  strategies: RawStrategy[],
  nodeRadius: number,
  viewWidth: number,
  viewHeight: number,
  datasets?: RawDataset[],
): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, number>();

  // Lookup table: name/id/outputColumn -> node id
  const lookup = new Map<string, string>();

  // Create indicator nodes (temporary positions)
  // For group indicators, create separate nodes for each output
  indicators.forEach((ind) => {
    if (ind.isGroup && ind.groupName && ind.expectedOutputs && ind.expectedOutputs.length > 0) {
      // Group indicator: create a node for each output column
      ind.expectedOutputs.forEach((outputName) => {
        const fullColumnName = `${ind.groupName}:${outputName}`;
        const nodeId = `${ind.id}:${outputName}`; // Unique node ID for each output

        // Map various lookup keys to this node
        lookup.set(nodeId, nodeId);
        lookup.set(fullColumnName, nodeId);

        const node: GraphNode = {
          id: nodeId,
          name: fullColumnName,
          type: 'indicator',
          color: '#3b82f6',
          x: 0,
          y: 0,
          vx: 0,
          vy: 0,
          radius: nodeRadius,
          componentId: 0,
          parentId: ind.id, // Track parent group indicator
        };

        nodeIndex.set(nodeId, nodes.length);
        nodes.push(node);
      });

      // Also add lookups for the group name and indicator id/name pointing to first output
      const firstOutputNodeId = `${ind.id}:${ind.expectedOutputs[0]}`;
      lookup.set(ind.id, firstOutputNodeId);
      lookup.set(ind.name, firstOutputNodeId);
      lookup.set(ind.groupName, firstOutputNodeId);
    } else {
      // Single indicator: create one node
      const id = ind.id;
      lookup.set(id, id);
      lookup.set(ind.name, id);
      lookup.set(ind.outputColumn, id);

      const node: GraphNode = {
        id,
        name: ind.name,
        type: 'indicator',
        color: '#3b82f6',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: nodeRadius,
        componentId: 0,
      };

      nodeIndex.set(id, nodes.length);
      nodes.push(node);
    }
  });

  // Create strategy nodes (temporary positions)
  strategies.forEach((strat) => {
    const id = strat.id;
    lookup.set(id, id);
    lookup.set(strat.name, id);

    const node: GraphNode = {
      id,
      name: strat.name,
      type: 'strategy',
      color: '#f59e0b',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: nodeRadius,
      componentId: 0,
    };

    nodeIndex.set(id, nodes.length);
    nodes.push(node);
  });

  // Create edges from indicator dependencies
  // Use dependencyColumns for precise column-level dependencies when available
  let edgeId = 0;
  indicators.forEach((ind) => {
    // Determine target node IDs for this indicator
    const targetIds: string[] = [];
    if (ind.isGroup && ind.groupName && ind.expectedOutputs && ind.expectedOutputs.length > 0) {
      // Group indicator: all output nodes are targets
      ind.expectedOutputs.forEach((outputName) => {
        targetIds.push(`${ind.id}:${outputName}`);
      });
    } else {
      // Single indicator: one target
      targetIds.push(ind.id);
    }

    // Use dependencyColumns for precise edges if available
    const depKeys = ind.dependencyColumns && ind.dependencyColumns.length > 0
      ? ind.dependencyColumns
      : ind.dependencies || [];

    depKeys.forEach((depKey) => {
      const sourceId = lookup.get(depKey);
      if (sourceId && nodeIndex.has(sourceId)) {
        // Create edge to first target (we don't need edges to all outputs, just to one representative)
        const targetId = targetIds[0];
        if (targetId && nodeIndex.has(targetId)) {
          edges.push({
            id: `e${edgeId++}`,
            sourceId,
            targetId,
          });
        }
      }
    });
  });

  // Create edges from strategy dependencies
  // Use dependencyColumns for precise column-level dependencies when available
  strategies.forEach((strat) => {
    const depKeys = strat.dependencyColumns && strat.dependencyColumns.length > 0
      ? strat.dependencyColumns
      : strat.dependencies || [];

    depKeys.forEach((depKey) => {
      const sourceId = lookup.get(depKey);
      const targetId = strat.id;
      if (sourceId && nodeIndex.has(sourceId) && nodeIndex.has(targetId)) {
        edges.push({
          id: `e${edgeId++}`,
          sourceId,
          targetId,
        });
      }
    });
  });

  // Create dataset nodes and edges
  // Datasets are referenced via externalDatasets field in indicators/strategies
  const datasetNodeIds = new Set<string>();
  const datasetLookup = new Map<string, string>(); // symbol/name -> nodeId

  if (datasets && datasets.length > 0) {
    // Collect which datasets are actually referenced
    const referencedDatasets = new Set<string>();

    // Check indicator externalDatasets
    indicators.forEach((ind) => {
      if (ind.externalDatasets && typeof ind.externalDatasets === 'object') {
        Object.values(ind.externalDatasets).forEach((ds) => {
          if (ds?.datasetName) referencedDatasets.add(ds.datasetName);
        });
      }
    });

    // Check strategy externalDatasets
    strategies.forEach((strat) => {
      if (strat.externalDatasets && typeof strat.externalDatasets === 'object') {
        Object.values(strat.externalDatasets).forEach((ds) => {
          if (ds?.datasetName) referencedDatasets.add(ds.datasetName);
        });
      }
    });

    // Create nodes only for referenced datasets
    datasets.forEach((ds) => {
      if (!referencedDatasets.has(ds.symbol) && !referencedDatasets.has(ds.name)) return;

      const nodeId = `ds:${ds.id}`;
      const displayName = ds.name !== ds.symbol ? `${ds.symbol} ${ds.name}` : ds.symbol;

      datasetLookup.set(ds.symbol, nodeId);
      datasetLookup.set(ds.name, nodeId);
      datasetLookup.set(ds.id, nodeId);

      const node: GraphNode = {
        id: nodeId,
        name: displayName,
        type: 'dataset',
        color: '#22c55e', // green
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: nodeRadius,
        componentId: 0,
      };

      nodeIndex.set(nodeId, nodes.length);
      nodes.push(node);
      datasetNodeIds.add(nodeId);
    });

    // Create edges: dataset → indicator/strategy
    // Dataset is the source (resource), indicator/strategy is the target (consumer)
    indicators.forEach((ind) => {
      if (!ind.externalDatasets || typeof ind.externalDatasets !== 'object') return;

      const targetIds: string[] = [];
      if (ind.isGroup && ind.groupName && ind.expectedOutputs && ind.expectedOutputs.length > 0) {
        targetIds.push(`${ind.id}:${ind.expectedOutputs[0]}`);
      } else {
        targetIds.push(ind.id);
      }

      Object.values(ind.externalDatasets).forEach((ds) => {
        const dsNodeId = ds?.datasetName ? datasetLookup.get(ds.datasetName) : null;
        if (dsNodeId && nodeIndex.has(dsNodeId) && targetIds[0] && nodeIndex.has(targetIds[0])) {
          edges.push({ id: `e${edgeId++}`, sourceId: dsNodeId, targetId: targetIds[0] });
        }
      });
    });

    strategies.forEach((strat) => {
      if (!strat.externalDatasets || typeof strat.externalDatasets !== 'object') return;

      Object.values(strat.externalDatasets).forEach((ds) => {
        const dsNodeId = ds?.datasetName ? datasetLookup.get(ds.datasetName) : null;
        if (dsNodeId && nodeIndex.has(dsNodeId) && nodeIndex.has(strat.id)) {
          edges.push({ id: `e${edgeId++}`, sourceId: dsNodeId, targetId: strat.id });
        }
      });
    });
  }

  // Compute connected components using Union-Find
  const componentCount = computeConnectedComponents(nodes, edges, nodeIndex);

  // Compute anchors for each component
  const componentSpacing = Math.min(viewWidth, viewHeight) * 0.4;
  const anchors = computeComponentAnchors(componentCount, componentSpacing);

  // Group nodes by component
  const componentNodes: GraphNode[][] = [];
  for (let i = 0; i < componentCount; i++) {
    componentNodes.push([]);
  }
  for (const node of nodes) {
    componentNodes[node.componentId].push(node);
  }

  // Set initial positions: each component in a circle around its anchor
  for (let c = 0; c < componentCount; c++) {
    const nodesInComponent = componentNodes[c];
    const anchor = anchors[c] || { x: 0, y: 0 };
    const count = nodesInComponent.length;
    const radius = Math.max(50, count * 15); // Scale radius by node count

    for (let i = 0; i < count; i++) {
      const angle = (2 * Math.PI * i) / Math.max(count, 1);
      nodesInComponent[i].x = anchor.x + radius * Math.cos(angle);
      nodesInComponent[i].y = anchor.y + radius * Math.sin(angle);
    }
  }

  return { nodes, edges, nodeIndex, componentCount };
}

/**
 * Union-Find to compute connected components.
 * Sets componentId on each node and returns total component count.
 */
function computeConnectedComponents(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeIndex: Map<string, number>
): number {
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();

  const find = (x: string): string => {
    if (!parent.has(x)) {
      parent.set(x, x);
      rank.set(x, 0);
    }
    if (parent.get(x) !== x) {
      parent.set(x, find(parent.get(x)!));
    }
    return parent.get(x)!;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA === rootB) return;

    const rankA = rank.get(rootA) || 0;
    const rankB = rank.get(rootB) || 0;

    if (rankA < rankB) {
      parent.set(rootA, rootB);
    } else if (rankA > rankB) {
      parent.set(rootB, rootA);
    } else {
      parent.set(rootB, rootA);
      rank.set(rootA, rankA + 1);
    }
  };

  // Initialize all nodes
  nodes.forEach((n) => find(n.id));

  // Union nodes connected by edges (undirected for component detection)
  edges.forEach((e) => {
    union(e.sourceId, e.targetId);
  });

  // Assign component IDs
  const rootToComponent = new Map<string, number>();
  let componentCount = 0;

  nodes.forEach((n) => {
    const root = find(n.id);
    if (!rootToComponent.has(root)) {
      rootToComponent.set(root, componentCount++);
    }
    n.componentId = rootToComponent.get(root)!;
  });

  return componentCount;
}

/**
 * Compute anchor positions for each component on a grid layout.
 */
export function computeComponentAnchors(
  componentCount: number,
  spacing: number
): { x: number; y: number }[] {
  const anchors: { x: number; y: number }[] = [];
  if (componentCount === 0) return anchors;

  const cols = Math.ceil(Math.sqrt(componentCount));
  const rows = Math.ceil(componentCount / cols);

  for (let i = 0; i < componentCount; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    anchors.push({
      x: (col - (cols - 1) / 2) * spacing,
      y: (row - (rows - 1) / 2) * spacing,
    });
  }

  return anchors;
}
