// Canvas renderer for graph visualization

import { GraphModel, GraphNode, Camera, InteractionState } from './types';

export interface RenderOptions {
  isDark: boolean;
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  nodeSize: number;
  time: number; // Animation time in ms
}

/**
 * Render the graph to a 2D canvas context
 */
export function renderGraph(
  ctx: CanvasRenderingContext2D,
  model: GraphModel,
  camera: Camera,
  width: number,
  height: number,
  options: RenderOptions
) {
  const { isDark, selectedNodeId, hoveredNodeId, nodeSize, time } = options;

  // Clear and fill background
  ctx.fillStyle = isDark ? '#030712' : '#f3f4f6';
  ctx.fillRect(0, 0, width, height);

  // Save context and apply camera transform
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // Draw edges first (below nodes)
  renderEdges(ctx, model, isDark, time, nodeSize);

  // Draw nodes
  renderNodes(ctx, model, isDark, selectedNodeId, hoveredNodeId, nodeSize);

  // Draw labels
  renderLabels(ctx, model, isDark, nodeSize);

  ctx.restore();
}

function renderEdges(
  ctx: CanvasRenderingContext2D,
  model: GraphModel,
  isDark: boolean,
  time: number,
  nodeSize: number
) {
  const { nodes, edges, nodeIndex } = model;

  // Animation: flowing dash offset (source → target direction)
  const dashLength = 8;
  const gapLength = 12;
  const totalPattern = dashLength + gapLength;
  const speed = 0.03; // pixels per ms
  const offset = (time * speed) % totalPattern;

  for (const edge of edges) {
    const sourceIdx = nodeIndex.get(edge.sourceId);
    const targetIdx = nodeIndex.get(edge.targetId);
    if (sourceIdx == null || targetIdx == null) continue;

    const source = nodes[sourceIdx];
    const target = nodes[targetIdx];

    // Calculate direction vector
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    // Shorten edge to not overlap with nodes
    const startX = source.x + nx * nodeSize;
    const startY = source.y + ny * nodeSize;
    const endX = target.x - nx * (nodeSize + 8); // Extra space for arrow
    const endY = target.y - ny * (nodeSize + 8);

    // Draw base line (subtle)
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw animated flowing dashes
    ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([dashLength, gapLength]);
    ctx.lineDashOffset = -offset; // Negative to flow from source to target
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Draw arrow at target end
    const arrowSize = 6;
    const arrowX = endX;
    const arrowY = endY;

    ctx.setLineDash([]);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.moveTo(arrowX, arrowY);
    ctx.lineTo(arrowX - nx * arrowSize - ny * arrowSize * 0.5, arrowY - ny * arrowSize + nx * arrowSize * 0.5);
    ctx.lineTo(arrowX - nx * arrowSize + ny * arrowSize * 0.5, arrowY - ny * arrowSize - nx * arrowSize * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // Reset dash
  ctx.setLineDash([]);
}

function renderNodes(
  ctx: CanvasRenderingContext2D,
  model: GraphModel,
  isDark: boolean,
  selectedNodeId: string | null,
  hoveredNodeId: string | null,
  nodeSize: number
) {
  const { nodes } = model;

  for (const node of nodes) {
    const isSelected = node.id === selectedNodeId;
    const isHovered = node.id === hoveredNodeId;
    const radius = nodeSize;

    // Selection glow
    if (isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'strategy'
        ? 'rgba(245, 158, 11, 0.3)'
        : 'rgba(59, 130, 246, 0.3)';
      ctx.fill();
    }

    // Hover glow
    if (isHovered && !isSelected) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius + 5, 0, Math.PI * 2);
      ctx.fillStyle = node.type === 'strategy'
        ? 'rgba(245, 158, 11, 0.2)'
        : 'rgba(59, 130, 246, 0.2)';
      ctx.fill();
    }

    // Node circle
    ctx.beginPath();
    ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = node.color;
    ctx.fill();

    // Node border
    if (isSelected || isHovered) {
      ctx.strokeStyle = isDark ? 'white' : 'black';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}

function renderLabels(
  ctx: CanvasRenderingContext2D,
  model: GraphModel,
  isDark: boolean,
  nodeSize: number
) {
  const { nodes } = model;

  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';

  for (const node of nodes) {
    ctx.fillText(node.name, node.x, node.y + nodeSize + 4);
  }
}

/**
 * World to screen coordinate conversion
 */
export function worldToScreen(
  cam: Camera,
  wx: number,
  wy: number,
  width: number,
  height: number
): { sx: number; sy: number } {
  return {
    sx: (wx - cam.x) * cam.zoom + width / 2,
    sy: (wy - cam.y) * cam.zoom + height / 2,
  };
}

/**
 * Screen to world coordinate conversion
 */
export function screenToWorld(
  cam: Camera,
  sx: number,
  sy: number,
  width: number,
  height: number
): { wx: number; wy: number } {
  return {
    wx: (sx - width / 2) / cam.zoom + cam.x,
    wy: (sy - height / 2) / cam.zoom + cam.y,
  };
}

/**
 * Hit test: find node at screen position
 */
export function hitTestNode(
  model: GraphModel,
  cam: Camera,
  sx: number,
  sy: number,
  width: number,
  height: number,
  nodeSize: number
): GraphNode | null {
  const { wx, wy } = screenToWorld(cam, sx, sy, width, height);

  // Check nodes in reverse order (top-most first)
  for (let i = model.nodes.length - 1; i >= 0; i--) {
    const node = model.nodes[i];
    const dx = node.x - wx;
    const dy = node.y - wy;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= nodeSize + 4) {
      return node;
    }
  }

  return null;
}
