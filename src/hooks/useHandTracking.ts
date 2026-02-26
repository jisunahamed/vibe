"use client";

import { useEffect, useRef, useCallback } from 'react';

export interface HandMetrics {
    present: boolean;
    centerX: number; // 0..1 normalised
    centerY: number;
    scale: number;   // 0..1 normalised (bigger = hand closer)
}

const DEFAULT_METRICS: HandMetrics = { present: false, centerX: 0.5, centerY: 0.5, scale: 0.5 };

/**
 * Webcam hand-tracking hook.
 *   status  — UI string ("Initializing…" / "No hand detected" / "Hand tracking failed" / "")
 *   metrics — live hand position + scale for driving visuals
 *   onFist  — external callback triggered on open→fist transition (cooldown 800 ms)
 *
 * The metrics ref is updated at camera framerate (~30 fps) without causing React re-renders;
 * the canvas animation loop reads it directly via getMetrics().
 */
export function useHandTracking(onFist: () => void) {
    const statusRef = useRef("Initializing…");
    const metricsRef = useRef<HandMetrics>({ ...DEFAULT_METRICS });
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const landmarkerRef = useRef<any>(null);
    const lastFistRef = useRef(0);
    const wasFistRef = useRef(false);
    const rafRef = useRef(0);

    // EMA smoothing state (not in React state to avoid renders)
    const smoothX = useRef(0.5);
    const smoothY = useRef(0.5);
    const smoothScale = useRef(0.5);
    const baseline = useRef<number | null>(null);

    const getStatus = useCallback(() => statusRef.current, []);
    const getMetrics = useCallback(() => metricsRef.current, []);

    useEffect(() => {
        let active = true;

        async function setup() {
            try {
                const { HandLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");

                const vision = await FilesetResolver.forVisionTasks(
                    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
                );

                const lm = await HandLandmarker.createFromOptions(vision, {
                    baseOptions: { modelAssetPath: "/models/hand_landmarker.task", delegate: "GPU" },
                    runningMode: "VIDEO",
                    numHands: 1,
                    minHandDetectionConfidence: 0.5,
                    minHandPresenceConfidence: 0.5,
                    minTrackingConfidence: 0.5,
                });

                if (!active) { lm.close(); return; }
                landmarkerRef.current = lm;

                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: "user", width: 640, height: 480 }, audio: false,
                });

                const v = document.createElement("video");
                v.srcObject = stream; v.autoplay = true; v.playsInline = true; v.muted = true;
                videoRef.current = v;
                await new Promise<void>(r => { v.onloadedmetadata = () => { v.play().then(() => r()); }; });

                statusRef.current = "No hand detected";
                loop();
            } catch {
                statusRef.current = "Hand tracking failed";
            }
        }

        function loop() {
            if (!active || !landmarkerRef.current || !videoRef.current) return;
            const v = videoRef.current;

            if (v.readyState >= 2) {
                try {
                    const res = landmarkerRef.current.detectForVideo(v, performance.now());

                    if (res.landmarks && res.landmarks.length > 0) {
                        statusRef.current = "";
                        const lm = res.landmarks[0];

                        // Palm metrics
                        const d2 = (a: any, b: any) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
                        const palmSize = d2(lm[0], lm[9]);

                        // Baseline calibration
                        if (baseline.current === null) baseline.current = palmSize;
                        baseline.current += (palmSize - baseline.current) * 0.005; // Very slow EMA

                        const rawScale = Math.min(Math.max((palmSize / baseline.current - 0.6) / 1.0, 0), 1);

                        const cx = (lm[0].x + lm[5].x + lm[9].x + lm[13].x + lm[17].x) / 5;
                        const cy = (lm[0].y + lm[5].y + lm[9].y + lm[13].y + lm[17].y) / 5;

                        // EMA smooth
                        const a = 0.15;
                        smoothX.current += (cx - smoothX.current) * a;
                        smoothY.current += (cy - smoothY.current) * a;
                        smoothScale.current += (rawScale - smoothScale.current) * a;

                        metricsRef.current = {
                            present: true,
                            centerX: smoothX.current,
                            centerY: smoothY.current,
                            scale: smoothScale.current,
                        };

                        // Fist detection
                        const palmCenter = { x: cx, y: cy };
                        const fingersClosed = [8, 12, 16, 20].every(i => d2(lm[i], palmCenter) < palmSize * 0.7);
                        const thumbClosed = d2(lm[4], palmCenter) < palmSize * 0.9;

                        if (fingersClosed && thumbClosed) {
                            const now = Date.now();
                            if (!wasFistRef.current && now - lastFistRef.current > 800) {
                                onFist();
                                lastFistRef.current = now;
                            }
                            wasFistRef.current = true;
                        } else {
                            wasFistRef.current = false;
                        }
                    } else {
                        statusRef.current = "No hand detected";
                        metricsRef.current = { ...metricsRef.current, present: false };
                    }
                } catch { /* suppress mediapipe internal logs */ }
            }

            rafRef.current = requestAnimationFrame(loop);
        }

        setup();

        return () => {
            active = false;
            cancelAnimationFrame(rafRef.current);
            if (videoRef.current?.srcObject)
                (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            landmarkerRef.current?.close();
        };
    }, [onFist]);

    return { getStatus, getMetrics };
}
