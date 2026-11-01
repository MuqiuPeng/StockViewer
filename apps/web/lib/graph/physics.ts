// Custom physics engine for graph simulation
// Uses triangle rule and f(x) = 1/x² - 1/ng² force formula

import { GraphModel, PhysicsParams } from './types';

export class GraphPhysics {
  private anchors: { x: number; y: number }[] = [];

  // Alpha (simulation temperature)
  private alpha = 1.0;
  private alphaDecay = 0.97;

  // Sleep detection
  private sleeping = false;
  private stableFrames = 0;
  private readonly sleepSpeedEps = 0.02;
  private readonly stableFramesRequired = 5;

  // Damping
  private readonly velocityDamping = 0.7;
  private readonly minSpeed = 0.02;

  constructor(
    private model: GraphModel,
    anchors: { x: number; y: number }[]
  ) {
    this.anchors = anchors;
  }

  reheat(strength = 1) {
    this.alpha = Math.max(this.alpha, strength);
    this.sleeping = false;
    this.stableFrames = 0;
  }

  wake() {
    if (this.sleeping) {
      for (const n of this.model.nodes) {
        n.vx = 0;
        n.vy = 0;
      }
      this.sleeping = false;
    }
    if (this.alpha < 0.1) {
      this.alpha = 0.1;
    }
    this.stableFrames = 0;
  }

  startSettle(kind: 'dragEnd' | 'paramChange' | 'dataChange', intensity = 1.0) {
    for (const n of this.model.nodes) {
      if (n.fx == null && n.fy == null) {
        n.vx = 0;
        n.vy = 0;
      }
    }

    switch (kind) {
      case 'dragEnd':
        this.reheat(0.15 * intensity);
        break;
      case 'paramChange':
        this.reheat(0.5 * intensity);
        break;
      case 'dataChange':
        this.reheat(1.0);
        break;
    }
  }

  isSleeping() {
    return this.sleeping;
  }

  getAlpha() {
    return this.alpha;
  }

  setAnchors(anchors: { x: number; y: number }[]) {
    this.anchors = anchors;
  }

  setModel(model: GraphModel) {
    this.model = model;
  }

  step(dt: number, params: PhysicsParams, viewW: number, viewH: number) {
    if (this.sleeping) return;

    const { nodes, edges, nodeIndex } = this.model;
    const rest = params.nodeGap;
    const a = this.alpha;

    let anyPinned = false;

    // 1) Spring forces (edges)
    for (const e of edges) {
      const i = nodeIndex.get(e.sourceId);
      const j = nodeIndex.get(e.targetId);
      if (i == null || j == null) continue;

      const n1 = nodes[i];
      const n2 = nodes[j];

      const dx = n2.x - n1.x;
      const dy = n2.y - n1.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const stretch = dist - rest;
      const f = params.springK * stretch * a;

      n1.vx += f * nx * dt;
      n1.vy += f * ny * dt;
      n2.vx -= f * nx * dt;
      n2.vy -= f * ny * dt;

      const rvx = n2.vx - n1.vx;
      const rvy = n2.vy - n1.vy;
      const relVel = rvx * nx + rvy * ny;
      const dampF = params.springDamping * relVel * a;

      n1.vx += dampF * nx * dt;
      n1.vy += dampF * ny * dt;
      n2.vx -= dampF * nx * dt;
      n2.vy -= dampF * ny * dt;
    }

    // 2) Node interaction forces: f(x) = 1/x² - 1/ng²
    // Only with nodes forming smallest containing triangle
    // For unconnected nodes: repulsion ×2, attraction ÷2
    const ng = params.nodeGap;
    const ng2 = ng * ng;

    // Build edge set for quick lookup
    const edgeSet = new Set<string>();
    for (const e of edges) {
      edgeSet.add(`${e.sourceId}-${e.targetId}`);
      edgeSet.add(`${e.targetId}-${e.sourceId}`);
    }

    // For each node, find smallest containing triangle and apply forces
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.fx != null && n.fy != null) continue;

      const triangleNodes = this.findSmallestContainingTriangle(n, nodes, i);

      for (const other of triangleNodes) {
        const dx = other.x - n.x;
        const dy = other.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / dist;
        const ny = dy / dist;

        // f(x) = K * (1/x² - 1/ng²)
        let strength = params.repulsionK * (1 / (dist * dist) - 1 / ng2) * a * dt;

        // Check if connected by edge
        const connected = edgeSet.has(`${n.id}-${other.id}`);
        if (!connected) {
          // Unconnected: repulsion ×2, attraction ÷2
          if (strength > 0) {
            strength *= 2;
          } else {
            strength /= 2;
          }
        }

        n.vx -= nx * strength;
        n.vy -= ny * strength;
      }
    }

    // 3) Component anchor attraction
    for (const n of nodes) {
      if (n.fx != null && n.fy != null) {
        anyPinned = true;
        continue;
      }

      const anchor = this.anchors[n.componentId] ?? { x: 0, y: 0 };
      n.vx += (anchor.x - n.x) * params.anchorK * a * dt;
      n.vy += (anchor.y - n.y) * params.anchorK * a * dt;
    }

    // 3.5) Angular forces
    this.applyAngularForces(nodes, edges, nodeIndex, a, dt);

    // 4) Apply damping and integrate
    for (const n of nodes) {
      if (n.fx != null && n.fy != null) {
        n.x = n.fx;
        n.y = n.fy;
        n.vx = 0;
        n.vy = 0;
        continue;
      }

      n.vx *= this.velocityDamping;
      n.vy *= this.velocityDamping;

      if (Math.abs(n.vx) < this.minSpeed) n.vx = 0;
      if (Math.abs(n.vy) < this.minSpeed) n.vy = 0;

      n.x += n.vx;
      n.y += n.vy;
    }

    // 5) Collision resolution
    const minGap = Math.max(8, params.nodeGap * 0.2);
    for (let iter = 0; iter < params.collisionIters; iter++) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const n1 = nodes[i];
          const n2 = nodes[j];

          const dx = n2.x - n1.x;
          const dy = n2.y - n1.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = n1.radius + n2.radius + minGap;

          if (dist >= minDist) continue;

          const nx = dx / dist;
          const ny = dy / dist;
          const push = (minDist - dist) * 0.5;

          if (n1.fx == null) {
            n1.x -= nx * push;
            n1.y -= ny * push;
          }
          if (n2.fx == null) {
            n2.x += nx * push;
            n2.y += ny * push;
          }
        }
      }
    }

    // 6) Boundary constraints
    const pad = params.boundsPadding;
    const maxX = viewW / 2 - pad;
    const maxY = viewH / 2 - pad;

    for (const n of nodes) {
      if (n.fx != null) continue;

      if (n.x < -maxX) { n.x = -maxX; n.vx *= -0.3; }
      if (n.x > maxX) { n.x = maxX; n.vx *= -0.3; }
      if (n.y < -maxY) { n.y = -maxY; n.vy *= -0.3; }
      if (n.y > maxY) { n.y = maxY; n.vy *= -0.3; }
    }

    // 7) Alpha decay
    this.alpha *= this.alphaDecay;
    if (this.alpha < 0.001) this.alpha = 0;

    // 8) Check for sleep
    this.checkSleep(nodes, anyPinned);
  }

  /**
   * Find the smallest triangle formed by other nodes that contains the given node
   */
  private findSmallestContainingTriangle(
    node: import('./types').GraphNode,
    nodes: import('./types').GraphNode[],
    nodeIdx: number
  ): import('./types').GraphNode[] {
    const px = node.x;
    const py = node.y;

    const others = nodes.filter((_, i) => i !== nodeIdx);
    if (others.length < 3) return others;

    // Point in triangle test (barycentric)
    const pointInTriangle = (
      ax: number, ay: number,
      bx: number, by: number,
      cx: number, cy: number
    ): boolean => {
      const v0x = cx - ax, v0y = cy - ay;
      const v1x = bx - ax, v1y = by - ay;
      const v2x = px - ax, v2y = py - ay;

      const dot00 = v0x * v0x + v0y * v0y;
      const dot01 = v0x * v1x + v0y * v1y;
      const dot02 = v0x * v2x + v0y * v2y;
      const dot11 = v1x * v1x + v1y * v1y;
      const dot12 = v1x * v2x + v1y * v2y;

      const denom = dot00 * dot11 - dot01 * dot01;
      if (Math.abs(denom) < 1e-10) return false;
      const invDenom = 1 / denom;
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;

      return u >= 0 && v >= 0 && (u + v) <= 1;
    };

    const triangleArea = (
      ax: number, ay: number,
      bx: number, by: number,
      cx: number, cy: number
    ): number => Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2;

    let bestTriangle: import('./types').GraphNode[] | null = null;
    let bestArea = Infinity;

    for (let i = 0; i < others.length; i++) {
      for (let j = i + 1; j < others.length; j++) {
        for (let k = j + 1; k < others.length; k++) {
          const a = others[i], b = others[j], c = others[k];
          if (pointInTriangle(a.x, a.y, b.x, b.y, c.x, c.y)) {
            const area = triangleArea(a.x, a.y, b.x, b.y, c.x, c.y);
            if (area < bestArea) {
              bestArea = area;
              bestTriangle = [a, b, c];
            }
          }
        }
      }
    }

    // Fallback: nearest 3 nodes
    if (!bestTriangle) {
      others.sort((a, b) => {
        const da = (a.x - px) * (a.x - px) + (a.y - py) * (a.y - py);
        const db = (b.x - px) * (b.x - px) + (b.y - py) * (b.y - py);
        return da - db;
      });
      return others.slice(0, 3);
    }

    return bestTriangle;
  }

  private normalizeAngle(a: number): number {
    while (a <= -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
  }

  private chooseBestBase(sortedAngles: number[], d: number): number {
    const step = (Math.PI * 2) / d;
    let sum = 0;
    for (let k = 0; k < d; k++) {
      sum += sortedAngles[k] - k * step;
    }
    return this.normalizeAngle(sum / d);
  }

  private applyAngularForces(
    nodes: import('./types').GraphNode[],
    edges: import('./types').GraphEdge[],
    nodeIndex: Map<string, number>,
    alpha: number,
    dt: number
  ) {
    const angleStrength = 0.06;
    const angleMaxDegree = 6;
    const angleMinRadius = 20;

    const neighbors: number[][] = nodes.map(() => []);
    for (const e of edges) {
      const i = nodeIndex.get(e.sourceId);
      const j = nodeIndex.get(e.targetId);
      if (i != null && j != null) {
        neighbors[i].push(j);
        neighbors[j].push(i);
      }
    }

    const stepScale = angleStrength * alpha;

    for (let ui = 0; ui < nodes.length; ui++) {
      const u = nodes[ui];
      if (u.fx != null && u.fy != null) continue;

      const neigh = neighbors[ui];
      const d = neigh.length;
      if (d < 2 || d > angleMaxDegree) continue;

      const items: { vi: number; theta: number; r: number; dx: number; dy: number }[] = [];
      for (const vi of neigh) {
        const v = nodes[vi];
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r < angleMinRadius) continue;
        const theta = Math.atan2(dy, dx);
        items.push({ vi, theta, r, dx, dy });
      }

      if (items.length !== d) continue;
      items.sort((a, b) => a.theta - b.theta);

      const step = (Math.PI * 2) / d;
      const sortedAngles = items.map(it => it.theta);
      const base = this.chooseBestBase(sortedAngles, d);

      for (let k = 0; k < d; k++) {
        const it = items[k];
        const v = nodes[it.vi];
        if (v.fx != null && v.fy != null) continue;

        const target = this.normalizeAngle(base + k * step);
        const err = this.normalizeAngle(it.theta - target);

        const invR = 1 / it.r;
        const tx = -it.dy * invR;
        const ty = it.dx * invR;
        const mag = -err * stepScale * it.r * dt;

        v.vx += tx * mag;
        v.vy += ty * mag;
      }
    }
  }

  private checkSleep(nodes: import('./types').GraphNode[], anyPinned: boolean) {
    if (anyPinned) {
      this.stableFrames = 0;
      return;
    }

    let maxSpeed = 0;
    for (const n of nodes) {
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > maxSpeed) maxSpeed = speed;
    }

    if (maxSpeed < this.sleepSpeedEps && this.alpha < 0.05) {
      this.stableFrames++;
      if (this.stableFrames >= this.stableFramesRequired) {
        for (const n of nodes) {
          n.vx = 0;
          n.vy = 0;
        }
        this.sleeping = true;
        this.alpha = 0;
      }
    } else {
      this.stableFrames = 0;
    }
  }
}

export function getDefaultPhysicsParams(nodeGap: number): PhysicsParams {
  return {
    nodeGap,
    springK: 0.12,
    springDamping: 0.18,
    repulsionK: 5000,
    repulsionRadius: nodeGap * 4.5,
    collisionIters: 2,
    velocityDamping: 0.7,
    anchorK: 0.004,
    boundsPadding: 60,
  };
}
