// Graph model types for custom physics-based graph visualization

export type NodeType = 'indicator' | 'strategy';

export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  color: string;
  // Physics state
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx?: number; // Pinned X (during drag)
  fy?: number; // Pinned Y (during drag)
  radius: number;
  componentId: number;
}

export interface GraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeIndex: Map<string, number>; // id -> array index
  componentCount: number;
}

export interface PhysicsParams {
  nodeGap: number;        // Primary spacing parameter (spring rest length)
  springK: number;        // Edge spring constant
  springDamping: number;  // Edge damping term
  repulsionK: number;     // Repulsion strength
  repulsionRadius: number;// Cutoff range for repulsion
  collisionIters: number; // Collision resolution iterations
  velocityDamping: number;// Velocity decay (0..1)
  anchorK: number;        // Weak pull toward component anchor
  boundsPadding: number;  // Boundary padding
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export type InteractionState =
  | { mode: 'idle' }
  | { mode: 'hovering'; nodeId: string }
  | { mode: 'dragging'; nodeId: string; offsetX: number; offsetY: number };
