"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useHandTracking } from '../hooks/useHandTracking';
import { ATTRACTORS, AttractorKey } from '../lib/attractors';

const AttractorCanvas = dynamic(() => import('./AttractorCanvas'), { ssr: false });

export default function AttractorApp() {
  const [attractorIndex, setAttractorIndex] = useState(0);
  const [debug, setDebug] = useState(false);
  const [statusText, setStatusText] = useState("Initializing…");
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const cycleAttractor = useCallback(() => {
    setAttractorIndex(prev => (prev + 1) % Object.keys(ATTRACTORS).length);
  }, []);

  const { getStatus, getMetrics } = useHandTracking(cycleAttractor);

  // Poll status text at a low frequency (UI only)
  useEffect(() => {
    const id = setInterval(() => setStatusText(getStatus()), 500);
    return () => clearInterval(id);
  }, [getStatus]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') setDebug(true);

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') { e.preventDefault(); cycleAttractor(); }
      if (e.key === 'd') setDebug(p => !p);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cycleAttractor]);

  const onPointerDown = (e: React.PointerEvent) => {
    pointerDownRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointerDownRef.current) return;
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    const dt = Date.now() - pointerDownRef.current.time;
    if (Math.sqrt(dx * dx + dy * dy) < 6 && dt < 250) cycleAttractor();
    pointerDownRef.current = null;
  };

  const keys = Object.keys(ATTRACTORS) as AttractorKey[];
  const name = ATTRACTORS[keys[attractorIndex % keys.length]].name;

  return (
    <div
      style={{ position: 'fixed', inset: 0, cursor: 'grab', userSelect: 'none' }}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <AttractorCanvas
        attractorIndex={attractorIndex}
        getMetrics={getMetrics}
        getStatus={getStatus}
        debug={debug}
      />

      {/* Overlay — pointer-events: none so OrbitControls isn't blocked */}
      <div style={{
        position: 'absolute', top: '2rem', left: '2rem',
        pointerEvents: 'none', zIndex: 10,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        <div style={{
          fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.4)', marginBottom: '0.5rem',
        }}>
          Drag to orbit · Fist to cycle
        </div>
        <div style={{
          fontSize: '2rem', fontWeight: 200, color: '#fff', letterSpacing: '0.04em',
        }}>
          {name}
        </div>
        {statusText && (
          <div style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.4rem', fontStyle: 'italic' }}>
            {statusText}
          </div>
        )}
        {debug && (
          <div style={{
            marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.65rem',
            background: 'rgba(0,0,0,0.5)', padding: '0.5rem', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.1)', color: '#0f0',
          }}>
            DEBUG ON (press d to toggle)
          </div>
        )}
      </div>
    </div>
  );
}
