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

      {/* Camera Preview */}
      <CameraPreview
        getVideo={getVideo}
        getLandmarks={getLandmarks}
        getStatus={getStatus}
      />

      {/* Top-left panel — minimal, like the reference */}
      <div style={{
        position: 'absolute', top: '1.5rem', left: '1.5rem',
        pointerEvents: 'none', zIndex: 10,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}>
        {/* Attractor label */}
        <div style={{
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.2em',
          color: 'rgba(255,255,255,0.35)',
          marginBottom: '0.5rem',
        }}>
          ATTRACTOR
        </div>

        {/* Attractor name — clean, white */}
        <div style={{
          fontSize: '1.5rem',
          fontWeight: 400,
          color: 'rgba(255,255,255,0.85)',
          letterSpacing: '0.04em',
          marginBottom: '0.8rem',
        }}>
          {name}
        </div>

        {/* Status */}
        {statusText && (
          <div style={{
            fontSize: '0.7rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              width: '6px', height: '6px', borderRadius: '50%',
              background: statusText.includes('fail') ? '#ff4444' :
                statusText.includes('No hand') ? '#ff8844' :
                  statusText === 'Initializing…' ? '#ffaa00' : '#00ff82',
            }} />
            <span style={{
              color: statusText.includes('fail') ? 'rgba(255,80,80,0.7)' :
                'rgba(255,255,255,0.35)',
              fontStyle: 'italic',
            }}>
              {statusText || 'Hand tracking active'}
            </span>
          </div>
        )}

        {debug && (
          <div style={{
            marginTop: '1rem', fontFamily: 'monospace', fontSize: '0.6rem',
            background: 'rgba(0,0,0,0.6)', padding: '0.5rem', borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.1)', color: '#0f0',
          }}>
            DEBUG ON (press d to toggle)
          </div>
        )}
      </div>

      {/* Bottom center — interaction hint + credit */}
      <div style={{
        position: 'absolute', bottom: '1.5rem', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        textAlign: 'center',
        fontFamily: '"Inter", -apple-system, sans-serif',
      }}>
        <div style={{
          fontSize: '0.65rem',
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.1em',
          pointerEvents: 'none',
          marginBottom: '0.6rem',
        }}>
          Drag to orbit · Fist to cycle
        </div>
        <div style={{
          fontSize: '0.65rem',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.05em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          <span style={{ pointerEvents: 'none' }}>built with ✦ by <span style={{ color: 'rgba(255,255,255,0.5)' }}>Jisun Ahamed</span></span>
          <a
            href="https://jisun.online"
            target="_blank"
            rel="noopener noreferrer"
            title="Portfolio — jisun.online"
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '26px',
              height: '26px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.5)',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
              fontSize: '13px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.15)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
            }}
          >
            {/* Globe icon (SVG) */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Hand tracking status — bottom right above camera */}
      <div style={{
        position: 'fixed', bottom: '195px', right: '20px',
        zIndex: 20, pointerEvents: 'none',
        fontFamily: '"Inter", sans-serif',
        fontSize: '0.65rem',
        color: !statusText ? 'rgba(0,255,130,0.6)' : 'rgba(255,100,60,0.5)',
        fontStyle: 'italic',
      }}>
        {statusText === '' ? '' : statusText.includes('fail') ? '● Hand tracking failed' : ''}
      </div>
    </div>
  );
}
