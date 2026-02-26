"use client";

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useHandTracking } from '../hooks/useHandTracking';
import { ATTRACTORS, AttractorKey } from '../lib/attractors';

const AttractorCanvas = dynamic(() => import('./AttractorCanvas'), { ssr: false });
const CameraPreview = dynamic(() => import('./CameraPreview'), { ssr: false });

export default function AttractorApp() {
  const [attractorIndex, setAttractorIndex] = useState(0);
  const [debug, setDebug] = useState(false);
  const [statusText, setStatusText] = useState("Initializing…");
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const cycleAttractor = useCallback(() => {
    setAttractorIndex(prev => (prev + 1) % Object.keys(ATTRACTORS).length);
  }, []);

  const { getStatus, getMetrics, getVideo, getLandmarks } = useHandTracking(cycleAttractor);

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
  const currentKey = keys[attractorIndex % keys.length];
  const name = ATTRACTORS[currentKey].name;

  // Color theme per attractor for UI
  const uiColors: Record<AttractorKey, string> = {
    lorenz: '#1a8cff',
    aizawa: '#ff6a1a',
    thomas: '#33e65a',
    halvorsen: '#e61a4e',
    arneodo: '#9933ff',
  };
  const accentColor = uiColors[currentKey] || '#1a8cff';

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

      {/* Camera Preview with hand landmarks */}
      <CameraPreview
        getVideo={getVideo}
        getLandmarks={getLandmarks}
        getStatus={getStatus}
      />

      {/* Top-left info overlay */}
      <div style={{
        position: 'absolute', top: '2rem', left: '2rem',
        pointerEvents: 'none', zIndex: 10,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {/* Instruction pill */}
        <div style={{
          display: 'inline-block',
          fontSize: '0.65rem',
          textTransform: 'uppercase',
          letterSpacing: '0.15em',
          color: 'rgba(255,255,255,0.5)',
          marginBottom: '0.75rem',
          background: 'rgba(255,255,255,0.06)',
          padding: '6px 14px',
          borderRadius: '20px',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(10px)',
        }}>
          ✋ Hand to control · ✊ Fist to switch · 🖱️ Scroll to zoom
        </div>

        {/* Attractor name with accent color */}
        <div style={{
          fontSize: '2.2rem',
          fontWeight: 200,
          color: '#fff',
          letterSpacing: '0.06em',
          textShadow: `0 0 30px ${accentColor}40`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
        }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: accentColor,
            boxShadow: `0 0 12px ${accentColor}`,
            display: 'inline-block',
          }} />
          {name}
        </div>

        {/* Attractor indicator dots */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginTop: '0.75rem',
          alignItems: 'center',
        }}>
          {keys.map((k, i) => (
            <div
              key={k}
              style={{
                width: i === (attractorIndex % keys.length) ? '20px' : '6px',
                height: '6px',
                borderRadius: '3px',
                background: i === (attractorIndex % keys.length) ? accentColor : 'rgba(255,255,255,0.2)',
                transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: i === (attractorIndex % keys.length) ? `0 0 8px ${accentColor}60` : 'none',
              }}
            />
          ))}
        </div>

        {/* Status text */}
        {statusText && (
          <div style={{
            fontSize: '0.7rem',
            color: statusText.includes('No hand') ? 'rgba(255,100,100,0.5)' :
              statusText.includes('fail') ? 'rgba(255,80,80,0.6)' :
                'rgba(255,255,255,0.35)',
            marginTop: '0.6rem',
            fontStyle: 'italic',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: statusText.includes('No hand') ? '#ff6464' :
                statusText.includes('fail') ? '#ff5050' :
                  statusText === 'Initializing…' ? '#ffaa00' : '#00ff82',
              boxShadow: statusText === '' ? '0 0 6px #00ff82' : 'none',
              animation: statusText === 'Initializing…' ? 'pulse 1.5s infinite' : 'none',
            }} />
            {statusText || 'Hand tracking active'}
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

      {/* Pulse animation keyframes */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}
