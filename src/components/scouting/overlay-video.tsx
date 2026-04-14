'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClipOverlay } from '@/lib/scouting/insights';

/**
 * Video player with synced SVG overlays.
 *
 * Overlays appear when the video reaches their timestamp and fade
 * out after their duration. Coach can scrub — overlays rewind with
 * the timeline.
 */

interface Props {
  src: string;
  overlays: ClipOverlay[];
  /** Optional: autoplay on mount. */
  autoPlay?: boolean;
  /** Optional: called when video ends. */
  onEnded?: () => void;
}

export function OverlayVideo({ src, overlays, autoPlay = true, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Track the video's visible size so we can position SVG overlays correctly
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateDims = () => {
      setDimensions({ width: container.clientWidth, height: container.clientHeight });
    };
    updateDims();
    const ro = new ResizeObserver(updateDims);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Update currentTime for overlay sync
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => setCurrentTime(v.currentTime);
    v.addEventListener('timeupdate', onTimeUpdate);
    v.addEventListener('seeked', onTimeUpdate);
    return () => {
      v.removeEventListener('timeupdate', onTimeUpdate);
      v.removeEventListener('seeked', onTimeUpdate);
    };
  }, [src]);

  // Filter overlays to ones currently visible
  const activeOverlays = overlays.filter((o) => {
    const duration = o.duration ?? 2;
    return currentTime >= o.timestamp && currentTime <= o.timestamp + duration;
  });

  return (
    <div ref={containerRef} className="relative w-full aspect-video rounded-xl overflow-hidden bg-black glow-blue">
      {/* biome-ignore lint/a11y/useMediaCaption: football film clips do not have caption tracks */}
      <video
        ref={videoRef}
        src={src}
        controls
        autoPlay={autoPlay}
        playsInline
        className="absolute inset-0 w-full h-full"
        onEnded={onEnded}
      />

      {/* SVG overlay layer */}
      {dimensions.width > 0 && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          preserveAspectRatio="none"
        >
          {activeOverlays.map((o, i) => (
            <OverlayShape key={i} overlay={o} width={dimensions.width} height={dimensions.height} />
          ))}
        </svg>
      )}

      {/* Subtle progress indicator showing where overlays appear */}
      <div className="absolute bottom-12 left-0 right-0 px-4 pointer-events-none">
        <div className="flex gap-0.5 opacity-70">
          {overlays.map((o, i) => (
            <div
              key={i}
              className="h-1 rounded-full bg-cyan-400/60 transition-all"
              style={{ width: '6px' }}
              title={`${o.timestamp}s: ${o.label ?? o.type}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function OverlayShape({ overlay, width, height }: { overlay: ClipOverlay; width: number; height: number }) {
  const color = overlay.color ?? (overlay.type === 'circle' ? '#06b6d4' : '#f43f5e');
  const x = overlay.x * width;
  const y = overlay.y * height;

  if (overlay.type === 'circle') {
    const r = (overlay.radius ?? 0.06) * width;
    return (
      <g>
        <circle
          cx={x}
          cy={y}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          opacity="0.9"
          className="animate-pulse"
        />
        {overlay.label && (
          <text
            x={x}
            y={y - r - 8}
            fill={color}
            fontSize="14"
            fontWeight="bold"
            textAnchor="middle"
            style={{
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {overlay.label}
          </text>
        )}
      </g>
    );
  }

  if (overlay.type === 'arrow' && overlay.toX !== undefined && overlay.toY !== undefined) {
    const toX = overlay.toX * width;
    const toY = overlay.toY * height;
    return (
      <g>
        <defs>
          <marker
            id={`arrow-${color.replace('#', '')}`}
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <polygon points="0,0 10,5 0,10" fill={color} />
          </marker>
        </defs>
        <line
          x1={x}
          y1={y}
          x2={toX}
          y2={toY}
          stroke={color}
          strokeWidth="3"
          opacity="0.9"
          markerEnd={`url(#arrow-${color.replace('#', '')})`}
        />
        {overlay.label && (
          <text
            x={(x + toX) / 2}
            y={(y + toY) / 2 - 10}
            fill={color}
            fontSize="14"
            fontWeight="bold"
            textAnchor="middle"
            style={{
              filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {overlay.label}
          </text>
        )}
      </g>
    );
  }

  if (overlay.type === 'label') {
    return (
      <text
        x={x}
        y={y}
        fill={color}
        fontSize="18"
        fontWeight="bold"
        textAnchor="middle"
        style={{
          filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.8))',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        {overlay.label}
      </text>
    );
  }

  if (overlay.type === 'zone') {
    const w = (overlay.radius ?? 0.15) * width;
    const h = (overlay.radius ?? 0.15) * height;
    return (
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        fill={color}
        fillOpacity="0.15"
        stroke={color}
        strokeWidth="2"
        strokeDasharray="6,3"
        opacity="0.8"
      />
    );
  }

  return null;
}
