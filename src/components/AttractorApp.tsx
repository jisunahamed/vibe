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

  const keys = Object.keys(ATTRACTORS) as AttractorKey[];
  const currentKey = keys[attractorIndex % keys.length];
  const name = ATTRACTORS[currentKey].name;

  return (
    <div style={{ position: 'fixed', inset: 0, cursor: 'grab', userSelect: 'none' }}>
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

      {/* Top-left panel — matching reference style */}
      <div style={{
        position: 'absolute', top: '1.2rem', left: '1.2rem',
        pointerEvents: 'auto', zIndex: 10,
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'rgba(10, 15, 30, 0.75)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        padding: '14px 18px',
      }}>
        {/* Label */}
        <div style={{
          fontSize: '0.55rem',
          textTransform: 'uppercase',
          letterSpacing: '0.25em',
          color: 'rgba(255,255,255,0.35)',
          marginBottom: '8px',
        }}>
          ATTRACTOR
        </div>

        {/* Dropdown selector like reference */}
        <select
          value={attractorIndex}
          onChange={(e) => setAttractorIndex(Number(e.target.value))}
          style={{
            background: 'rgba(255,255,255,0.08)',
            color: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '6px',
            padding: '6px 28px 6px 10px',
            fontSize: '0.8rem',
            fontFamily: 'inherit',
            cursor: 'pointer',
            outline: 'none',
            width: '100%',
            appearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='rgba(255,255,255,0.5)'%3E%3Cpath d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 8px center',
          }}
        >
          {keys.map((k, i) => (
            <option key={k} value={i} style={{ background: '#1a1a2e', color: '#fff' }}>
              {ATTRACTORS[k].name}
            </option>
          ))}
        </select>

        {/* Status */}
        <div style={{
          marginTop: '10px',
          fontSize: '0.6rem',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
        }}>
          <span style={{
            width: '5px', height: '5px', borderRadius: '50%',
            background: statusText.includes('fail') ? '#ff4444' :
              statusText === '' ? '#00ff82' :
                statusText.includes('No hand') ? '#ff8844' : '#ffaa00',
          }} />
          <span style={{
            color: statusText.includes('fail') ? 'rgba(255,80,80,0.7)' :
              'rgba(255,255,255,0.3)',
          }}>
            {statusText.includes('fail') ? 'Error' : statusText || 'Active'}
          </span>
        </div>
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
          fontSize: '0.6rem',
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.08em',
          pointerEvents: 'none',
          marginBottom: '6px',
        }}>
          Drag to orbit · Fist to cycle
        </div>
        <div style={{
          fontSize: '0.6rem',
          color: 'rgba(255,255,255,0.25)',
          letterSpacing: '0.04em',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}>
          <span style={{ pointerEvents: 'none' }}>
            built with ✦ by <span style={{ color: 'rgba(255,255,255,0.45)' }}>Jisun Ahamed</span>
          </span>
          <a
            href="https://jisun.online"
            target="_blank"
            rel="noopener noreferrer"
            title="jisun.online"
            style={{
              pointerEvents: 'auto',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: 'rgba(255,255,255,0.4)',
              textDecoration: 'none',
              transition: 'all 0.3s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
              e.currentTarget.style.color = 'rgba(255,255,255,0.4)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </a>
        </div>
      </div>

      {/* Hand tracking status — above camera preview */}
      <div style={{
        position: 'fixed', bottom: '195px', right: '20px',
        zIndex: 20, pointerEvents: 'none',
        fontFamily: '"Inter", sans-serif',
        fontSize: '0.6rem',
        color: !statusText ? 'rgba(0,255,130,0.6)' : 'rgba(255,100,60,0.45)',
        fontStyle: 'italic',
      }}>
        {statusText === '' ? '' : statusText.includes('fail') ? '● Hand tracking failed' : ''}
      </div>

      {debug && (
        <div style={{
          position: 'fixed', top: '1rem', right: '1rem',
          fontFamily: 'monospace', fontSize: '0.55rem', zIndex: 30,
          background: 'rgba(0,0,0,0.7)', padding: '8px 12px', borderRadius: 6,
          border: '1px solid rgba(255,255,255,0.1)', color: '#0f0',
          pointerEvents: 'none',
        }}>
          DEBUG (d to toggle)
        </div>
      )}
    </div>
  );
}
