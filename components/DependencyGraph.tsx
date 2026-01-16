'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import IndicatorEditorModal from './IndicatorEditorModal';
import StrategyEditorModal from './StrategyEditorModal';
import { useTheme } from './ThemeProvider';

import {
  GraphModel,
  GraphNode,
  Camera,
  InteractionState,
  buildGraphModel,
  computeComponentAnchors,
  GraphPhysics,
  getDefaultPhysicsParams,
  renderGraph,
  hitTestNode,
  screenToWorld,
} from '@/lib/graph';

interface Indicator {
  id: string;
  name: string;
  dependencies?: string[];
  outputColumn: string;
}

interface Strategy {
  id: string;
  name: string;
  dependencies?: string[];
  strategyType?: string;
}

export default function DependencyGraph() {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // Data state
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dimensions
  const NAVBAR_HEIGHT = 56;
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modelRef = useRef<GraphModel | null>(null);
  const physicsRef = useRef<GraphPhysics | null>(null);
  const animationRef = useRef<number>(0);
  const initializedRef = useRef(false); // Prevent double initialization in StrictMode

  // Edit modal states
  const [editingIndicator, setEditingIndicator] = useState<Indicator | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [isIndicatorModalOpen, setIsIndicatorModalOpen] = useState(false);
  const [isStrategyModalOpen, setIsStrategyModalOpen] = useState(false);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const interactionRef = useRef<InteractionState>({ mode: 'idle' });

  // Settings
  const [nodeSize, setNodeSize] = useState(24);
  const [nodeGap, setNodeGap] = useState(130);
  const [showSettings, setShowSettings] = useState(false);

  // Camera (centered, no pan/zoom for now)
  const cameraRef = useRef<Camera>({ x: 0, y: 0, zoom: 1 });

  // Computed values
  const hasData = indicators.length > 0 || strategies.length > 0;

  // Fetch data
  const fetchData = async () => {
    try {
      setError(null);
      const [indRes, stratRes] = await Promise.all([
        fetch('/api/indicators'),
        fetch('/api/strategies'),
      ]);

      const indData = await indRes.json();
      const stratData = await stratRes.json();

      setIndicators(indData.indicators || []);
      setStrategies(stratData.strategies || []);
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Update dimensions on resize
  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight - NAVBAR_HEIGHT,
      });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Build graph model ONLY when data changes (not when nodeGap/nodeSize changes)
  useEffect(() => {
    if (loading) return;
    if (indicators.length === 0 && strategies.length === 0) return;

    // Skip if already initialized with same data (StrictMode protection)
    if (initializedRef.current && physicsRef.current && modelRef.current?.nodes.length === indicators.length + strategies.length) {
      return;
    }

    const model = buildGraphModel(
      indicators,
      strategies,
      nodeSize,
      dimensions.width,
      dimensions.height
    );
    modelRef.current = model;

    // Compute component anchors
    const anchors = computeComponentAnchors(model.componentCount, nodeGap * 3);

    // Create or update physics engine
    if (physicsRef.current) {
      physicsRef.current.setModel(model);
      physicsRef.current.setAnchors(anchors);
    } else {
      physicsRef.current = new GraphPhysics(model, anchors);
    }

    // Start simulation with data change settle (including on initial load)
    physicsRef.current.startSettle('dataChange');
    initializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [indicators, strategies, loading, dimensions.width, dimensions.height]);

  // Update physics params when nodeGap/nodeSize changes (preserve positions)
  useEffect(() => {
    if (!physicsRef.current || !modelRef.current) return;

    // Update anchors based on new nodeGap
    const anchors = computeComponentAnchors(modelRef.current.componentCount, nodeGap * 3);
    physicsRef.current.setAnchors(anchors);

    // Update node radii (preserve x, y positions)
    for (const node of modelRef.current.nodes) {
      node.radius = nodeSize;
    }

    // Start settle to apply parameter changes
    physicsRef.current.startSettle('paramChange');
  }, [nodeGap, nodeSize]);

  // Store render options in ref to avoid re-creating animation loop
  const renderOptionsRef = useRef({
    isDark,
    selectedNodeId: selectedNode?.id ?? null,
    hoveredNodeId: hoveredNode?.id ?? null,
    nodeSize,
    nodeGap,
  });

  // Update render options ref when state changes
  useEffect(() => {
    renderOptionsRef.current = {
      isDark,
      selectedNodeId: selectedNode?.id ?? null,
      hoveredNodeId: hoveredNode?.id ?? null,
      nodeSize,
      nodeGap,
    };
  }, [isDark, selectedNode, hoveredNode, nodeSize, nodeGap]);

  // Animation loop - runs continuously, reads from refs
  // Must re-run when loading/hasData changes because canvas isn't mounted until then
  useEffect(() => {
    // Don't start if still loading or no data
    if (loading || !hasData) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let lastTime = performance.now();

    const animate = (time: number) => {
      const dt = Math.min((time - lastTime) / 16.67, 2); // Normalize to ~60fps
      lastTime = time;

      const model = modelRef.current;
      const physics = physicsRef.current;
      const opts = renderOptionsRef.current;

      if (model && physics) {
        // Get physics params with current nodeGap
        const params = getDefaultPhysicsParams(opts.nodeGap);
        params.repulsionRadius = opts.nodeGap * 5;

        // Step physics
        physics.step(dt, params, dimensions.width, dimensions.height);

        // Render
        renderGraph(ctx, model, cameraRef.current, dimensions.width, dimensions.height, {
          isDark: opts.isDark,
          selectedNodeId: opts.selectedNodeId,
          hoveredNodeId: opts.hoveredNodeId,
          nodeSize: opts.nodeSize,
          time,
        });
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animationRef.current);
    };
  }, [dimensions, loading, hasData]); // Re-run when canvas becomes available

  // Mouse event handlers
  // IMPORTANT: Click/hover does NOT wake simulation. Only drag and parameter changes do.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!canvas || !model) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const interaction = interactionRef.current;

    if (interaction.mode === 'dragging') {
      // Update pinned position
      const { wx, wy } = screenToWorld(
        cameraRef.current,
        sx,
        sy,
        dimensions.width,
        dimensions.height
      );

      const nodeIdx = model.nodeIndex.get(interaction.nodeId);
      if (nodeIdx != null) {
        const node = model.nodes[nodeIdx];
        node.fx = wx - interaction.offsetX;
        node.fy = wy - interaction.offsetY;
      }

      // Keep-alive wake during drag (prevents sleeping mid-drag, no velocity boost)
      physicsRef.current?.wake();
    } else {
      // Hit test for hover - does NOT wake simulation
      const hit = hitTestNode(
        model,
        cameraRef.current,
        sx,
        sy,
        dimensions.width,
        dimensions.height,
        nodeSize
      );

      setHoveredNode(hit);

      if (containerRef.current) {
        containerRef.current.style.cursor = hit ? 'pointer' : 'default';
      }
    }
  }, [dimensions, nodeSize]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!canvas || !model) return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = hitTestNode(
      model,
      cameraRef.current,
      sx,
      sy,
      dimensions.width,
      dimensions.height,
      nodeSize
    );

    if (hit) {
      // Start dragging - WAKE simulation
      const { wx, wy } = screenToWorld(
        cameraRef.current,
        sx,
        sy,
        dimensions.width,
        dimensions.height
      );

      interactionRef.current = {
        mode: 'dragging',
        nodeId: hit.id,
        offsetX: wx - hit.x,
        offsetY: wy - hit.y,
      };

      // Pin the node
      hit.fx = hit.x;
      hit.fy = hit.y;

      // Wake simulation on drag start (gentle, no velocity boost)
      physicsRef.current?.wake();

      if (containerRef.current) {
        containerRef.current.style.cursor = 'grabbing';
      }
    }
  }, [dimensions, nodeSize]);

  const handleMouseUp = useCallback(() => {
    const model = modelRef.current;
    const interaction = interactionRef.current;

    if (interaction.mode === 'dragging' && model) {
      const nodeIdx = model.nodeIndex.get(interaction.nodeId);
      if (nodeIdx != null) {
        const node = model.nodes[nodeIdx];
        // Release pin
        node.fx = undefined;
        node.fy = undefined;
      }

      // Start settle after drag release
      physicsRef.current?.startSettle('dragEnd');
    }

    interactionRef.current = { mode: 'idle' };

    if (containerRef.current) {
      containerRef.current.style.cursor = hoveredNode ? 'pointer' : 'default';
    }
  }, [hoveredNode]);

  // Click to select - does NOT wake simulation
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!canvas || !model) return;

    // Ignore if we were dragging
    if (interactionRef.current.mode === 'dragging') return;

    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const hit = hitTestNode(
      model,
      cameraRef.current,
      sx,
      sy,
      dimensions.width,
      dimensions.height,
      nodeSize
    );

    // Selection changes only - NO reheat here
    if (hit) {
      if (selectedNode?.id === hit.id) {
        setSelectedNode(null);
      } else {
        setSelectedNode(hit);
      }
    } else {
      setSelectedNode(null);
      setShowCreateMenu(false);
    }
  }, [dimensions, nodeSize, selectedNode]);

  // Action handlers
  const handleResetGraph = () => {
    setNodeSize(24);
    setNodeGap(130);
    // Note: the useEffect for nodeGap/nodeSize will trigger startSettle('paramChange')
  };

  const handleCreateIndicator = () => {
    setEditingIndicator(null);
    setIsIndicatorModalOpen(true);
    setShowCreateMenu(false);
  };

  const handleCreateStrategy = () => {
    setEditingStrategy(null);
    setIsStrategyModalOpen(true);
    setShowCreateMenu(false);
  };

  const handleEditIndicator = (indicator: Indicator) => {
    setEditingIndicator(indicator);
    setIsIndicatorModalOpen(true);
    setHoveredNode(null);
    setSelectedNode(null);
  };

  const handleEditStrategy = (strategy: Strategy) => {
    setEditingStrategy(strategy);
    setIsStrategyModalOpen(true);
    setHoveredNode(null);
    setSelectedNode(null);
  };

  // Helper: remove node from graph directly
  const removeNodeFromGraph = (nodeId: string) => {
    const model = modelRef.current;
    if (!model) return;

    // Remove node
    const nodeIdx = model.nodeIndex.get(nodeId);
    if (nodeIdx == null) return;

    model.nodes.splice(nodeIdx, 1);
    model.nodeIndex.delete(nodeId);

    // Rebuild nodeIndex (indices shifted after splice)
    model.nodeIndex.clear();
    model.nodes.forEach((n, i) => model.nodeIndex.set(n.id, i));

    // Remove edges connected to this node
    model.edges = model.edges.filter(
      (e) => e.sourceId !== nodeId && e.targetId !== nodeId
    );

    // Wake physics
    physicsRef.current?.wake();
    physicsRef.current?.reheat(0.3);
  };

  // Helper: add node to graph directly
  const addNodeToGraph = (
    item: Indicator | Strategy,
    type: 'indicator' | 'strategy'
  ) => {
    const model = modelRef.current;
    if (!model) return;

    // Check if already exists
    if (model.nodeIndex.has(item.id)) return;

    // Create new node at center with some randomness
    const newNode: GraphNode = {
      id: item.id,
      name: item.name,
      type,
      color: type === 'indicator' ? '#3b82f6' : '#f59e0b',
      x: (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 100,
      vx: 0,
      vy: 0,
      radius: nodeSize,
      componentId: 0,
    };

    model.nodeIndex.set(item.id, model.nodes.length);
    model.nodes.push(newNode);

    // Add edges for dependencies
    if (item.dependencies) {
      for (const depName of item.dependencies) {
        // Find source node by name or id
        const sourceNode = model.nodes.find(
          (n) => n.name === depName || n.id === depName
        );
        if (sourceNode) {
          model.edges.push({
            id: `e${Date.now()}-${Math.random()}`,
            sourceId: sourceNode.id,
            targetId: item.id,
          });
        }
      }
    }

    // Wake physics
    physicsRef.current?.wake();
    physicsRef.current?.reheat(0.5);
  };

  // Helper: update existing node in graph (name and edges)
  const updateNodeInGraph = (
    item: Indicator | Strategy,
    type: 'indicator' | 'strategy'
  ) => {
    const model = modelRef.current;
    if (!model) return;

    const nodeIdx = model.nodeIndex.get(item.id);
    if (nodeIdx == null) return;

    // Update node name
    model.nodes[nodeIdx].name = item.name;

    // Remove old edges where this node is the target
    model.edges = model.edges.filter((e) => e.targetId !== item.id);

    // Add new edges for dependencies
    if (item.dependencies) {
      for (const depName of item.dependencies) {
        const sourceNode = model.nodes.find(
          (n) => n.name === depName || n.id === depName
        );
        if (sourceNode) {
          model.edges.push({
            id: `e${Date.now()}-${Math.random()}`,
            sourceId: sourceNode.id,
            targetId: item.id,
          });
        }
      }
    }

    // Wake physics gently
    physicsRef.current?.wake();
  };

  const handleDeleteIndicator = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete indicator "${name}"?`)) return;

    try {
      const response = await fetch(`/api/indicators/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete indicator');
      }
      setHoveredNode(null);
      setSelectedNode(null);

      // Directly update graph and state
      removeNodeFromGraph(id);
      setIndicators((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete indicator');
    }
  };

  const handleDeleteStrategy = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete strategy "${name}"?`)) return;

    try {
      const response = await fetch(`/api/strategies/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to delete strategy');
      }
      setHoveredNode(null);
      setSelectedNode(null);

      // Directly update graph and state
      removeNodeFromGraph(id);
      setStrategies((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete strategy');
    }
  };

  const handleModalSuccess = async (newItem?: Indicator | Strategy, type?: 'indicator' | 'strategy') => {
    setIsIndicatorModalOpen(false);
    setIsStrategyModalOpen(false);

    if (newItem && type) {
      // Update state and graph
      if (type === 'indicator') {
        if (editingIndicator) {
          // Update existing node in graph
          updateNodeInGraph(newItem, type);
          setIndicators((prev) =>
            prev.map((i) => (i.id === newItem.id ? (newItem as Indicator) : i))
          );
        } else {
          // Add new node to graph
          addNodeToGraph(newItem, type);
          setIndicators((prev) => [...prev, newItem as Indicator]);
        }
      } else {
        if (editingStrategy) {
          // Update existing node in graph
          updateNodeInGraph(newItem, type);
          setStrategies((prev) =>
            prev.map((s) => (s.id === newItem.id ? (newItem as Strategy) : s))
          );
        } else {
          // Add new node to graph
          addNodeToGraph(newItem, type);
          setStrategies((prev) => [...prev, newItem as Strategy]);
        }
      }
    }

    setEditingIndicator(null);
    setEditingStrategy(null);
  };

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>Loading dependencies...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
        style={{ width: dimensions.width, height: dimensions.height }}
      >
        <div className="text-center text-red-500">{error}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative ${isDark ? 'bg-gray-900' : 'bg-gray-100'}`}
      style={{ width: dimensions.width, height: dimensions.height }}
    >
      {!hasData ? (
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <svg
              className={`w-20 h-20 mx-auto mb-4 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
              />
            </svg>
            <p className={`text-lg ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
              No indicators or strategies yet
            </p>
            <p className={`mt-2 ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>
              Create some to see the dependency graph
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            width={dimensions.width}
            height={dimensions.height}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleClick}
            style={{ display: 'block' }}
          />

          {/* Legend and Settings - top left */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <div
              className={`w-64 flex items-center gap-4 backdrop-blur-sm rounded-lg px-4 py-2 border ${
                isDark ? 'bg-black/50 border-white/10' : 'bg-white/70 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Indicator
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                  Strategy
                </span>
              </div>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`ml-auto p-1 rounded transition-colors ${
                  isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'
                }`}
                title="Settings"
              >
                <svg
                  className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </button>
            </div>

            {/* Settings Panel */}
            {showSettings && (
              <div
                className={`w-64 backdrop-blur-sm rounded-lg px-4 py-3 border ${
                  isDark ? 'bg-black/50 border-white/10' : 'bg-white/70 border-gray-200'
                }`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="space-y-3">
                  <div>
                    <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Node Size: {nodeSize}px
                    </label>
                    <input
                      type="range"
                      min="12"
                      max="40"
                      value={nodeSize}
                      onChange={(e) => setNodeSize(Number(e.target.value))}
                      className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                      Node Gap: {nodeGap}px
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="250"
                      value={nodeGap}
                      onChange={(e) => setNodeGap(Number(e.target.value))}
                      className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={handleResetGraph}
                    className={`w-full px-3 py-1.5 text-xs rounded-lg transition-colors ${
                      isDark
                        ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                    }`}
                  >
                    Reset Graph
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Stats and Create button - top right */}
          <div className="absolute top-4 right-4 flex items-center gap-3">
            <div
              className={`flex items-center gap-4 backdrop-blur-sm rounded-lg px-4 py-2 border ${
                isDark ? 'bg-black/50 border-white/10' : 'bg-white/70 border-gray-200'
              }`}
            >
              <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <strong className={isDark ? 'text-white' : 'text-gray-900'}>
                  {indicators.length}
                </strong>{' '}
                indicators
              </span>
              <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <strong className={isDark ? 'text-white' : 'text-gray-900'}>
                  {strategies.length}
                </strong>{' '}
                strategies
              </span>
              <span className={`text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                <strong className={isDark ? 'text-white' : 'text-gray-900'}>
                  {modelRef.current?.edges.length ?? 0}
                </strong>{' '}
                links
              </span>
            </div>

            {/* Create button with dropdown */}
            <div className="relative" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => setShowCreateMenu(!showCreateMenu)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg border backdrop-blur-sm transition-all hover:scale-105 ${
                  isDark
                    ? 'bg-blue-500/80 border-blue-400/50 text-white hover:bg-blue-500'
                    : 'bg-blue-500 border-blue-400 text-white hover:bg-blue-600'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Create
              </button>

              {showCreateMenu && (
                <div
                  className={`absolute top-full left-0 right-0 mt-2 rounded-lg border shadow-xl p-2 flex justify-center gap-3 ${
                    isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                  }`}
                >
                  <button
                    onClick={handleCreateIndicator}
                    className="w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 transition-all hover:scale-110 shadow-lg"
                    title="Create Indicator"
                  />
                  <button
                    onClick={handleCreateStrategy}
                    className="w-8 h-8 rounded-full bg-amber-500 hover:bg-amber-400 transition-all hover:scale-110 shadow-lg"
                    title="Create Strategy"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Node actions panel - bottom center */}
          {(() => {
            const activeNode = selectedNode || hoveredNode;
            if (!activeNode) return null;
            const isSelected = selectedNode?.id === activeNode.id;

            return (
              <div
                className={`absolute bottom-6 left-1/2 transform -translate-x-1/2 backdrop-blur-md rounded-xl px-5 py-3 border shadow-2xl ${
                  isDark
                    ? `bg-black/70 ${isSelected ? 'border-white/40' : 'border-white/20'}`
                    : `bg-white/80 ${isSelected ? 'border-gray-400' : 'border-gray-200'}`
                }`}
              >
                <div className="flex items-center gap-5">
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-4 h-4 rounded-full ${
                        activeNode.type === 'strategy' ? 'bg-amber-500' : 'bg-blue-500'
                      } shadow-lg`}
                    ></div>
                    <span
                      className={`font-semibold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}
                    >
                      {activeNode.name}
                    </span>
                    <span
                      className={`text-xs capitalize px-2 py-1 rounded-full ${
                        isDark ? 'text-gray-400 bg-white/10' : 'text-gray-600 bg-gray-200'
                      }`}
                    >
                      {activeNode.type}
                    </span>
                    {isSelected && (
                      <span className="text-xs text-blue-400 bg-blue-500/20 px-2 py-1 rounded-full">
                        Selected
                      </span>
                    )}
                  </div>
                  <div className={`w-px h-8 ${isDark ? 'bg-white/20' : 'bg-gray-300'}`}></div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        if (activeNode.type === 'indicator') {
                          const ind = indicators.find((i) => i.id === activeNode.id);
                          if (ind) handleEditIndicator(ind);
                        } else {
                          const strat = strategies.find((s) => s.id === activeNode.id);
                          if (strat) handleEditStrategy(strat);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-400 transition-all hover:scale-105"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => {
                        if (activeNode.type === 'indicator') {
                          handleDeleteIndicator(activeNode.id, activeNode.name);
                        } else {
                          handleDeleteStrategy(activeNode.id, activeNode.name);
                        }
                      }}
                      className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/80 text-white rounded-lg hover:bg-red-500 transition-all hover:scale-105"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Instructions - bottom left */}
          <div
            className={`absolute bottom-4 left-4 text-xs ${
              isDark ? 'text-gray-500' : 'text-gray-500'
            }`}
          >
            Click node to select · Click background to deselect · Drag node to move
          </div>
        </>
      )}

      {/* Indicator Editor Modal */}
      <IndicatorEditorModal
        isOpen={isIndicatorModalOpen}
        onClose={() => {
          setIsIndicatorModalOpen(false);
          setEditingIndicator(null);
        }}
        onSuccess={handleModalSuccess}
        indicator={editingIndicator as any}
      />

      {/* Strategy Editor Modal */}
      <StrategyEditorModal
        isOpen={isStrategyModalOpen}
        onClose={() => {
          setIsStrategyModalOpen(false);
          setEditingStrategy(null);
        }}
        onSuccess={handleModalSuccess}
        strategy={editingStrategy as any}
      />
    </div>
  );
}
