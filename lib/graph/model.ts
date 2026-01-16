// Graph model builder with connected components

import { GraphNode, GraphEdge, GraphModel, NodeType } from './types';

interface RawIndicator {
  id: string;
  name: string;
  outputColumn: string;
  dependencies?: string[];
}

interface RawStrategy {
  id: string;
  name: string;
  dependencies?: string[];
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
  viewHeight: number
): GraphModel {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const nodeIndex = new Map<string, number>();

  // Lookup table: name/id/outputColumn -> node id
  const lookup = new Map<string, string>();

  // Create indicator nodes (temporary positions)
  indicators.forEach((ind) => {
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
  let edgeId = 0;
  indicators.forEach((ind) => {
    ind.dependencies?.forEach((depKey) => {
      const sourceId = lookup.get(depKey);
      const targetId = ind.id;
      if (sourceId && nodeIndex.has(sourceId) && nodeIndex.has(targetId)) {
        edges.push({
          id: `e${edgeId++}`,
          sourceId,
          targetId,
        });
      }
    });
  });

  // Create edges from strategy dependencies
  strategies.forEach((strat) => {
    strat.dependencies?.forEach((depKey) => {
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
