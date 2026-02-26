"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';

import { ATTRACTORS, AttractorKey } from '../lib/attractors';
import type { HandMetrics } from '../hooks/useHandTracking';

interface Props {
    attractorIndex: number;
    getMetrics: () => HandMetrics;
    getStatus: () => string;
    debug?: boolean;
}

/* ─── Color palettes for each attractor ───────────────────────────── */
const ATTRACTOR_PALETTES: Record<AttractorKey, { primary: [number, number, number], secondary: [number, number, number], accent: [number, number, number] }> = {
    lorenz: {
        primary: [0.1, 0.6, 1.0],    // Electric blue
        secondary: [0.9, 0.2, 0.5],   // Hot pink
        accent: [0.3, 1.0, 0.8],      // Cyan/teal
    },
    aizawa: {
        primary: [1.0, 0.4, 0.1],    // Orange
        secondary: [0.3, 0.1, 0.9],   // Deep purple
        accent: [1.0, 0.8, 0.2],      // Gold
    },
    thomas: {
        primary: [0.2, 0.9, 0.4],    // Neon green
        secondary: [0.0, 0.5, 1.0],   // Sky blue
        accent: [0.8, 1.0, 0.3],      // Lime
    },
    halvorsen: {
        primary: [0.9, 0.1, 0.3],    // Crimson
        secondary: [1.0, 0.6, 0.0],   // Amber
        accent: [1.0, 0.3, 0.7],      // Magenta
    },
    arneodo: {
        primary: [0.6, 0.2, 1.0],    // Violet
        secondary: [0.2, 0.8, 1.0],   // Ice blue
        accent: [0.9, 0.4, 1.0],      // Orchid
    },
};

/* ─── Live particle system ─────────────────────────────────────────── */

const PARTICLE_COUNT = 3000;   // Number of live particles
const TRAIL_LENGTH = 10;       // Each particle = trail of N sub-points
const TOTAL_POINTS = PARTICLE_COUNT * TRAIL_LENGTH;

interface ParticleState {
    positions: Float32Array;
    colors: Float32Array;
    alphas: Float32Array;
    sizes: Float32Array;     // Per-point size for variety
    heads: Float32Array;
    key: AttractorKey;
    normCenter: [number, number, number];
    normScale: number;
}

/** Initialise particles randomly near the attractor's initial condition */
function initParticles(key: AttractorKey): ParticleState {
    const att = ATTRACTORS[key];
    const palette = ATTRACTOR_PALETTES[key];
    const positions = new Float32Array(TOTAL_POINTS * 3);
    const colors = new Float32Array(TOTAL_POINTS * 3);
    const alphas = new Float32Array(TOTAL_POINTS);
    const sizes = new Float32Array(TOTAL_POINTS);
    const heads = new Float32Array(PARTICLE_COUNT * 3);

    // Pre-compute normalization reference
    let p: [number, number, number] = [...att.initial];
    const refPts: [number, number, number][] = [];
    for (let i = 0; i < 5000; i++) {
        p = rk4Step(p, att);
        if (isNaN(p[0]) || Math.abs(p[0]) > 1e4) { p = [...att.initial]; }
        if (i > 1000) refPts.push([...p]);
    }

    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const rp of refPts) {
        minX = Math.min(minX, rp[0]); maxX = Math.max(maxX, rp[0]);
        minY = Math.min(minY, rp[1]); maxY = Math.max(maxY, rp[1]);
        minZ = Math.min(minZ, rp[2]); maxZ = Math.max(maxZ, rp[2]);
    }
    const normCenter: [number, number, number] = [(minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2];
    const normScale = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;

    // Scatter particles across the reference trajectory
    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ref = refPts[Math.floor(Math.random() * refPts.length)];
        const jx = ref[0] + (Math.random() - 0.5) * normScale * 0.02;
        const jy = ref[1] + (Math.random() - 0.5) * normScale * 0.02;
        const jz = ref[2] + (Math.random() - 0.5) * normScale * 0.02;
        heads[i * 3] = jx; heads[i * 3 + 1] = jy; heads[i * 3 + 2] = jz;

        // Choose color from palette based on particle position along trajectory
        const colorMix = (i / PARTICLE_COUNT);
        const phase = colorMix * Math.PI * 2;

        for (let t = 0; t < TRAIL_LENGTH; t++) {
            const idx = (i * TRAIL_LENGTH + t) * 3;
            const nx = (jx - normCenter[0]) / normScale;
            const ny = (jy - normCenter[1]) / normScale;
            const nz = (jz - normCenter[2]) / normScale;
            positions[idx] = nx; positions[idx + 1] = ny; positions[idx + 2] = nz;

            // Color: interpolate between palette colors based on position
            const blend1 = Math.sin(phase) * 0.5 + 0.5;
            const blend2 = Math.sin(phase + 2.09) * 0.5 + 0.5;
            colors[idx] = palette.primary[0] * blend1 + palette.secondary[0] * blend2 + palette.accent[0] * (1 - blend1) * 0.3;
            colors[idx + 1] = palette.primary[1] * blend1 + palette.secondary[1] * blend2 + palette.accent[1] * (1 - blend1) * 0.3;
            colors[idx + 2] = palette.primary[2] * blend1 + palette.secondary[2] * blend2 + palette.accent[2] * (1 - blend1) * 0.3;

            // Clamp colors
            colors[idx] = Math.min(1.0, colors[idx]);
            colors[idx + 1] = Math.min(1.0, colors[idx + 1]);
            colors[idx + 2] = Math.min(1.0, colors[idx + 2]);

            // Alpha: head is bright, tail fades out smoothly
            const trailFade = 1.0 - (t / TRAIL_LENGTH);
            alphas[i * TRAIL_LENGTH + t] = trailFade * trailFade; // Quadratic falloff

            // Size: head is larger, tail gets smaller
            sizes[i * TRAIL_LENGTH + t] = (t === 0) ? 1.0 : Math.max(0.3, trailFade);
        }
    }

    return { positions, colors, alphas, sizes, heads, key, normCenter, normScale };
}

/** Advance all particles one step along the attractor */
function stepParticles(state: ParticleState) {
    const att = ATTRACTORS[state.key];
    const { positions, heads, normCenter, normScale } = state;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Shift trail backward
        for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
            const dst = (i * TRAIL_LENGTH + t) * 3;
            const src = (i * TRAIL_LENGTH + t - 1) * 3;
            positions[dst] = positions[src];
            positions[dst + 1] = positions[src + 1];
            positions[dst + 2] = positions[src + 2];
        }

        // Advance head
        let hx = heads[i * 3], hy = heads[i * 3 + 1], hz = heads[i * 3 + 2];
        const next = rk4Step([hx, hy, hz], att);

        if (isNaN(next[0]) || Math.abs(next[0]) > 1e4) {
            const init = att.initial;
            next[0] = init[0] + (Math.random() - 0.5) * 0.1;
            next[1] = init[1] + (Math.random() - 0.5) * 0.1;
            next[2] = init[2] + (Math.random() - 0.5) * 0.1;
        }

        heads[i * 3] = next[0]; heads[i * 3 + 1] = next[1]; heads[i * 3 + 2] = next[2];

        const idx = (i * TRAIL_LENGTH) * 3;
        positions[idx] = (next[0] - normCenter[0]) / normScale;
        positions[idx + 1] = (next[1] - normCenter[1]) / normScale;
        positions[idx + 2] = (next[2] - normCenter[2]) / normScale;
    }
}

/** Single RK4 step */
function rk4Step(p: [number, number, number], att: typeof ATTRACTORS[AttractorKey]): [number, number, number] {
    const f = att.derive;
    const pr = att.params;
    const dt = att.dt;
    const k1 = f(p, pr);
    const k2 = f([p[0] + k1[0] * dt * 0.5, p[1] + k1[1] * dt * 0.5, p[2] + k1[2] * dt * 0.5], pr);
    const k3 = f([p[0] + k2[0] * dt * 0.5, p[1] + k2[1] * dt * 0.5, p[2] + k2[2] * dt * 0.5], pr);
    const k4 = f([p[0] + k3[0] * dt, p[1] + k3[1] * dt, p[2] + k3[2] * dt], pr);
    return [
        p[0] + (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * dt / 6,
        p[1] + (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * dt / 6,
        p[2] + (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) * dt / 6,
    ];
}

/* ─── Custom Shader Material for particles ──────────────────────── */

const vertexShader = `
    attribute float alpha;
    attribute float size;
    uniform float uBreathe;
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float breatheSize = size * (1.0 + uBreathe * 0.3);
        gl_PointSize = breatheSize * (150.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 6.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
        // Soft circle shape
        float d = length(gl_PointCoord - vec2(0.5));

        if (d > 0.5) discard;
        float softEdge = 1.0 - smoothstep(0.1, 0.5, d);
        gl_FragColor = vec4(vColor, vAlpha * softEdge * 0.85);
    }
`;


/* ─── React Component ──────────────────────────────────────────────── */

export default function AttractorCanvas({ attractorIndex, getMetrics, getStatus, debug = false }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);

    const groupRef = useRef<THREE.Group | null>(null);
    const pointsRef = useRef<THREE.Points | null>(null);
    const stateRef = useRef<ParticleState | null>(null);
    const readyRef = useRef(false);
    const prevIdxRef = useRef(-1);
    const curScale = useRef(1.0);
    const curBiasX = useRef(0);
    const curBiasY = useRef(0);

    useEffect(() => {
        if (!containerRef.current) return;
        readyRef.current = false;

        const w = window.innerWidth;
        const h = window.innerHeight;

        // ── Scene ──
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x050510);
        scene.fog = new THREE.FogExp2(0x050510, 0.15);

        // ── Camera ──
        const camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 500);
        camera.position.set(0, 0, 2.5);

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x050510, 1);
        renderer.domElement.style.display = 'block';
        containerRef.current.appendChild(renderer.domElement);

        // ── Post-processing ──
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.3, 0.85);
        composer.addPass(bloom);

        // AfterimagePass for smooth trail/fusion effect (safe with NormalBlending)
        const afterimage = new AfterimagePass();
        afterimage.uniforms['damp'].value = 0.88;
        composer.addPass(afterimage);

        // ── Controls ──
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.minDistance = 0.5;
        controls.maxDistance = 8.0;
        controls.autoRotate = false;

        // ── Attractor group ──
        const group = new THREE.Group();
        scene.add(group);
        groupRef.current = group;

        // ── Init live particles ──
        const keys = Object.keys(ATTRACTORS) as AttractorKey[];
        const initKey = keys[attractorIndex % keys.length];
        const pState = initParticles(initKey);
        stateRef.current = pState;

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pState.positions, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(pState.colors, 3));
        geo.setAttribute('alpha', new THREE.Float32BufferAttribute(pState.alphas, 1));
        geo.setAttribute('size', new THREE.Float32BufferAttribute(pState.sizes, 1));

        const shaderMat = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uBreathe: { value: 0.0 },
            },
            transparent: true,
            depthWrite: false,
            blending: THREE.NormalBlending,
            vertexColors: true,
        });

        const pts = new THREE.Points(geo, shaderMat);
        group.add(pts);
        pointsRef.current = pts;
        prevIdxRef.current = attractorIndex;
        readyRef.current = true;

        // ── Starfield ──
        const STAR_N = 3000;
        const sP = new Float32Array(STAR_N * 3);
        const sC = new Float32Array(STAR_N * 3);
        for (let i = 0; i < STAR_N; i++) {
            const r = 10 + Math.random() * 25;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            sP[i * 3] = r * Math.sin(ph) * Math.cos(th);
            sP[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
            sP[i * 3 + 2] = r * Math.cos(ph);
            // Subtle colored stars
            const starHue = Math.random();
            sC[i * 3] = 0.5 + 0.5 * Math.sin(starHue * 6.28);
            sC[i * 3 + 1] = 0.5 + 0.5 * Math.sin(starHue * 6.28 + 2);
            sC[i * 3 + 2] = 0.5 + 0.5 * Math.sin(starHue * 6.28 + 4);
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(sP, 3));
        sGeo.setAttribute('color', new THREE.BufferAttribute(sC, 3));
        const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({
            size: 0.03, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false,
        }));
        scene.add(stars);

        // ── Optional ambient light ring (subtle aesthetic) ──
        const ringGeo = new THREE.TorusGeometry(1.2, 0.003, 8, 100);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0x3366ff,
            transparent: true,
            opacity: 0.15,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        // ── Debug ──
        if (debug) {
            scene.add(new THREE.AxesHelper(2));
        }

        // ── Animation loop ──
        const clock = new THREE.Clock();
        let animId = 0;
        let stepAccum = 0;

        function animate() {
            animId = requestAnimationFrame(animate);
            const dt = clock.getDelta();
            const t = clock.getElapsedTime();
            controls.update();

            // ── Advance live particles (controlled speed — 2 steps per frame) ──
            if (stateRef.current && pointsRef.current) {
                stepAccum += dt;
                const stepsPerFrame = Math.min(Math.floor(stepAccum / 0.008), 3);
                for (let s = 0; s < stepsPerFrame; s++) {
                    stepParticles(stateRef.current);
                }
                if (stepsPerFrame > 0) stepAccum = 0;

                // Upload updated positions to GPU
                const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
                (posAttr.array as Float32Array).set(stateRef.current.positions);
                posAttr.needsUpdate = true;
            }

            // ── Group rotation (SLOW — enjoyable to watch) ──
            group.rotation.y += 0.002;
            group.rotation.x += 0.0008;
            group.rotation.z = Math.sin(t * 0.3) * 0.04;

            // ── Ring animation ──
            ring.rotation.z = t * 0.2;
            ringMat.opacity = 0.08 + Math.sin(t * 0.8) * 0.04;

            // ── Hand interaction ──
            const m = getMetrics();
            if (m.present) {
                // Scale: hand closer = bigger
                const tgtScale = 0.6 + m.scale * 1.8;
                curScale.current += (tgtScale - curScale.current) * 0.06;
                group.scale.setScalar(curScale.current);

                // Rotation bias from hand position
                curBiasY.current += ((m.centerX - 0.5) * 1.2 - curBiasY.current) * 0.04;
                curBiasX.current += ((m.centerY - 0.5) * 0.8 - curBiasX.current) * 0.04;
                group.rotation.y += curBiasY.current * 0.04;
                group.rotation.x += curBiasX.current * 0.04;
            } else {
                curScale.current += (1.0 - curScale.current) * 0.03;
                group.scale.setScalar(curScale.current);
                curBiasX.current *= 0.95;
                curBiasY.current *= 0.95;
            }

            // ── Breathing point size ──
            shaderMat.uniforms.uBreathe.value = Math.sin(t * 1.5) * 0.5;

            // ── Rotate stars ──
            stars.rotation.y += 0.0001;
            stars.rotation.x += 0.00005;

            composer.render();
        }
        animate();

        // ── Resize ──
        function onResize() {
            const nw = window.innerWidth, nh = window.innerHeight;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh);
            composer.setSize(nw, nh);
        }
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            cancelAnimationFrame(animId);
            renderer.dispose();
            controls.dispose();
            readyRef.current = false;
            groupRef.current = null;
            if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
                containerRef.current.removeChild(renderer.domElement);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /* ── Attractor swap (subsequent changes only) ── */
    useEffect(() => {
        if (prevIdxRef.current === attractorIndex) return;
        if (!readyRef.current || !groupRef.current || !pointsRef.current) return;

        const keys = Object.keys(ATTRACTORS) as AttractorKey[];
        const key = keys[attractorIndex % keys.length];
        const newState = initParticles(key);
        stateRef.current = newState;

        // Update geometry buffers in-place
        const geo = pointsRef.current.geometry;
        const posAttr = geo.attributes.position as THREE.BufferAttribute;
        const colAttr = geo.attributes.color as THREE.BufferAttribute;
        const alphaAttr = geo.attributes.alpha as THREE.BufferAttribute;
        const sizeAttr = geo.attributes.size as THREE.BufferAttribute;
        (posAttr.array as Float32Array).set(newState.positions);
        (colAttr.array as Float32Array).set(newState.colors);
        (alphaAttr.array as Float32Array).set(newState.alphas);
        (sizeAttr.array as Float32Array).set(newState.sizes);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        alphaAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;

        prevIdxRef.current = attractorIndex;
    }, [attractorIndex]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', inset: 0,
                width: '100vw', height: '100vh',
                background: '#050510', zIndex: 0,
            }}
        />
    );
}
