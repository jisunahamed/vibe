"use client";

import { useEffect, useRef, useCallback } from 'react';
import type { HandLandmark } from '../hooks/useHandTracking';

// MediaPipe Hand Landmark connections
const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
    [0, 5], [5, 6], [6, 7], [7, 8],       // Index
    [0, 9], [9, 10], [10, 11], [11, 12],   // Middle
    [0, 13], [13, 14], [14, 15], [15, 16], // Ring
    [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
    [5, 9], [9, 13], [13, 17],             // Palm
];

interface CameraPreviewProps {
    getVideo: () => HTMLVideoElement | null;
    getLandmarks: () => HandLandmark[] | null;
    getStatus: () => string;
}

export default function CameraPreview({ getVideo, getLandmarks, getStatus }: CameraPreviewProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rafRef = useRef(0);

    const draw = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const video = getVideo();
        const landmarks = getLandmarks();
        const status = getStatus();

        const w = canvas.width;
        const h = canvas.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Draw video frame (mirrored)
        if (video && video.readyState >= 2) {
            ctx.save();
            ctx.translate(w, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, w, h);
            ctx.restore();
        } else {
            // Dark background if no video
            ctx.fillStyle = '#0a0a1a';
            ctx.fillRect(0, 0, w, h);
        }

        // Semi-transparent overlay
        ctx.fillStyle = 'rgba(5, 5, 16, 0.3)';
        ctx.fillRect(0, 0, w, h);

        // Draw hand landmarks
        if (landmarks && landmarks.length > 0) {
            // Draw connections (bones)
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';

            for (const [start, end] of HAND_CONNECTIONS) {
                const p1 = landmarks[start];
                const p2 = landmarks[end];
                if (!p1 || !p2) continue;

                // Gradient color based on finger group
                let color: string;
                if (start <= 4 || end <= 4) {
                    color = '#ff6b9d'; // Thumb - pink
                } else if (start <= 8 || end <= 8) {
                    color = '#4ecdc4'; // Index - teal
                } else if (start <= 12 || end <= 12) {
                    color = '#45b7d1'; // Middle - blue
                } else if (start <= 16 || end <= 16) {
                    color = '#f7dc6f'; // Ring - gold
                } else {
                    color = '#bb8fce'; // Pinky - purple
                }

                ctx.strokeStyle = color;
                ctx.beginPath();
                ctx.moveTo((1 - p1.x) * w, p1.y * h);
                ctx.lineTo((1 - p2.x) * w, p2.y * h);
                ctx.stroke();
            }

            // Draw joints (points)
            for (let i = 0; i < landmarks.length; i++) {
                const lm = landmarks[i];
                const x = (1 - lm.x) * w;
                const y = lm.y * h;

                // Finger tips get bigger, brighter dots
                const isTip = [4, 8, 12, 16, 20].includes(i);
                const isWrist = i === 0;

                // Glow effect
                if (isTip) {
                    const gradient = ctx.createRadialGradient(x, y, 0, x, y, 8);
                    gradient.addColorStop(0, 'rgba(0, 255, 130, 0.8)');
                    gradient.addColorStop(1, 'rgba(0, 255, 130, 0)');
                    ctx.fillStyle = gradient;
                    ctx.beginPath();
                    ctx.arc(x, y, 8, 0, Math.PI * 2);
                    ctx.fill();
                }

                // Main dot
                ctx.fillStyle = isTip ? '#00ff82' : (isWrist ? '#ff4444' : '#00ff82');
                ctx.beginPath();
                ctx.arc(x, y, isTip ? 4 : 2.5, 0, Math.PI * 2);
                ctx.fill();

                // White center for tips
                if (isTip) {
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(x, y, 1.5, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Status indicator
        const isDetected = landmarks && landmarks.length > 0;
        const statusColor = isDetected ? '#00ff82' : '#ff4444';
        const statusLabel = isDetected ? '● HAND DETECTED' : (status === 'Initializing…' ? '◌ LOADING...' : '○ NO HAND');

        // Status pill
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        const pillW = 120;
        const pillH = 20;
        const pillX = w / 2 - pillW / 2;
        const pillY = h - 28;
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 10);
        ctx.fill();

        ctx.fillStyle = statusColor;
        ctx.font = 'bold 9px "Inter", "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(statusLabel, w / 2, pillY + pillH / 2);

        rafRef.current = requestAnimationFrame(draw);
    }, [getVideo, getLandmarks, getStatus]);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(rafRef.current);
    }, [draw]);

    return (
        <div
            id="camera-preview"
            style={{
                position: 'fixed',
                bottom: '20px',
                right: '20px',
                width: '220px',
                height: '165px',
                borderRadius: '16px',
                overflow: 'hidden',
                border: '2px solid rgba(255, 255, 255, 0.15)',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 255, 130, 0.1)',
                zIndex: 20,
                backdropFilter: 'blur(10px)',
                background: 'rgba(5, 5, 16, 0.8)',
            }}
        >
            <canvas
                ref={canvasRef}
                width={220}
                height={165}
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                }}
            />
            {/* Corner label */}
            <div style={{
                position: 'absolute',
                top: '8px',
                left: '10px',
                fontSize: '8px',
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'rgba(255, 255, 255, 0.5)',
                fontFamily: '"Inter", "Segoe UI", sans-serif',
            }}>
                📷 CAMERA
            </div>
        </div>
    );
}
