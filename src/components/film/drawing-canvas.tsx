'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Drawing canvas — SVG overlay on the video player for telestration.
 *
 * Tools:
 *   - Freehand: draw with mouse/finger
 *   - Circle: click and drag to draw a circle (highlight a player)
 *   - Arrow: click start → drag to end (show route/assignment)
 *
 * Drawings are ephemeral — not persisted to DB. This is a coaching
 * tool for live film sessions, not permanent annotation.
 */

type Tool = 'freehand' | 'circle' | 'arrow';

interface FreehandShape {
  type: 'freehand';
  points: Array<{ x: number; y: number }>;
  color: string;
}

interface CircleShape {
  type: 'circle';
  cx: number;
  cy: number;
  r: number;
  color: string;
}

interface ArrowShape {
  type: 'arrow';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

type Shape = FreehandShape | CircleShape | ArrowShape;

const COLORS = ['#f43f5e', '#3b82f6', '#fbbf24', '#22c55e', '#ffffff'];
const TOOL_ICONS: Record<Tool, string> = {
  freehand: 'M3 17l6-6 4 4 8-8',
  circle: 'M12 2a10 10 0 110 20 10 10 0 010-20z',
  arrow: 'M5 12h14M12 5l7 7-7 7',
};

interface DrawingCanvasProps {
  width: number;
  height: number;
}

export function DrawingCanvas({ width, height }: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>('freehand');
  const [color, setColor] = useState(COLORS[0] ?? '#f43f5e');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentShape, setCurrentShape] = useState<Shape | null>(null);
  const [isActive, setIsActive] = useState(false);

  const getPoint = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const rect = svg.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * width,
        y: ((e.clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height],
  );

  const handlePointerDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isActive) return;
      const pt = getPoint(e);
      setIsDrawing(true);

      if (tool === 'freehand') {
        setCurrentShape({ type: 'freehand', points: [pt], color });
      } else if (tool === 'circle') {
        setCurrentShape({ type: 'circle', cx: pt.x, cy: pt.y, r: 0, color });
      } else if (tool === 'arrow') {
        setCurrentShape({ type: 'arrow', x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y, color });
      }
    },
    [isActive, tool, color, getPoint],
  );

  const handlePointerMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!isDrawing || !currentShape) return;
      const pt = getPoint(e);

      if (currentShape.type === 'freehand') {
        setCurrentShape({
          ...currentShape,
          points: [...currentShape.points, pt],
        });
      } else if (currentShape.type === 'circle') {
        const dx = pt.x - currentShape.cx;
        const dy = pt.y - currentShape.cy;
        setCurrentShape({ ...currentShape, r: Math.sqrt(dx * dx + dy * dy) });
      } else if (currentShape.type === 'arrow') {
        setCurrentShape({ ...currentShape, x2: pt.x, y2: pt.y });
      }
    },
    [isDrawing, currentShape, getPoint],
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing || !currentShape) return;
    setIsDrawing(false);

    // Only add shape if it has meaningful size
    const isValid =
      (currentShape.type === 'freehand' && currentShape.points.length > 2) ||
      (currentShape.type === 'circle' && currentShape.r > 3) ||
      (currentShape.type === 'arrow' &&
        Math.abs(currentShape.x2 - currentShape.x1) + Math.abs(currentShape.y2 - currentShape.y1) > 5);

    if (isValid) {
      setShapes((prev) => [...prev, currentShape]);
    }
    setCurrentShape(null);
  }, [isDrawing, currentShape]);

  function handleUndo() {
    setShapes((prev) => prev.slice(0, -1));
  }

  function handleClear() {
    setShapes([]);
    setCurrentShape(null);
  }

  return (
    <div className="relative">
      {/* SVG overlay */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className={`absolute inset-0 w-full h-full z-10 ${
          isActive ? 'cursor-crosshair' : 'pointer-events-none'
        }`}
        onMouseDown={handlePointerDown}
        onMouseMove={handlePointerMove}
        onMouseUp={handlePointerUp}
        onMouseLeave={handlePointerUp}
      >
        {/* Arrow marker definition */}
        <defs>
          {COLORS.map((c) => (
            <marker
              key={c}
              id={`arrowhead-${c.replace('#', '')}`}
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={c} />
            </marker>
          ))}
        </defs>

        {/* Committed shapes */}
        {shapes.map((shape, i) => (
          <ShapeRenderer key={i} shape={shape} />
        ))}

        {/* Shape being drawn */}
        {currentShape && <ShapeRenderer shape={currentShape} />}
      </svg>

      {/* Toolbar */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-black/80 backdrop-blur-sm border border-white/10 px-2 py-1.5">
        {/* Toggle drawing mode */}
        <button
          type="button"
          onClick={() => setIsActive(!isActive)}
          className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
            isActive
              ? 'bg-primary text-white'
              : 'text-slate-400 hover:text-white hover:bg-white/10'
          }`}
          title={isActive ? 'Exit drawing mode' : 'Enter drawing mode'}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>

        {isActive && (
          <>
            <div className="w-px h-5 bg-white/10" />

            {/* Tool buttons */}
            {(Object.keys(TOOL_ICONS) as Tool[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTool(t)}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${
                  tool === t
                    ? 'bg-white/20 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-white/10'
                }`}
                title={t.charAt(0).toUpperCase() + t.slice(1)}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d={TOOL_ICONS[t]} />
                </svg>
              </button>
            ))}

            <div className="w-px h-5 bg-white/10" />

            {/* Color swatches */}
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-5 w-5 rounded-full border-2 transition-all ${
                  color === c ? 'border-white scale-110' : 'border-transparent hover:border-white/40'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}

            <div className="w-px h-5 bg-white/10" />

            {/* Undo */}
            <button
              type="button"
              onClick={handleUndo}
              disabled={shapes.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Undo"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v6h6" />
                <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
              </svg>
            </button>

            {/* Clear all */}
            <button
              type="button"
              onClick={handleClear}
              disabled={shapes.length === 0}
              className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 disabled:opacity-30 disabled:pointer-events-none transition-all"
              title="Clear all"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ShapeRenderer({ shape }: { shape: Shape }) {
  if (shape.type === 'freehand') {
    if (shape.points.length < 2) return null;
    const d = shape.points
      .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x},${pt.y}`)
      .join(' ');
    return (
      <path
        d={d}
        fill="none"
        stroke={shape.color}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    );
  }

  if (shape.type === 'circle') {
    return (
      <circle
        cx={shape.cx}
        cy={shape.cy}
        r={shape.r}
        fill="none"
        stroke={shape.color}
        strokeWidth="3"
        opacity="0.85"
      />
    );
  }

  if (shape.type === 'arrow') {
    return (
      <line
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={shape.color}
        strokeWidth="3"
        opacity="0.85"
        markerEnd={`url(#arrowhead-${shape.color.replace('#', '')})`}
      />
    );
  }

  return null;
}
