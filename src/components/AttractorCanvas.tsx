"use client";

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { ATTRACTORS, AttractorKey } from '../lib/attractors';
import type { HandMetrics } from '../hooks/useHandTracking';

interface Props {
    attractorIndex: number;
    getMetrics: () => HandMetrics;
    getStatus: () => string;
    debug?: boolean;
}

/* ─── Color palettes matching reference exactly ───────────────────── */
const ATTRACTOR_PALETTES: Record<AttractorKey, { colors: [number, number, number][] }> = {
    lorenz: {
        colors: [
            [0.2, 0.85, 1.0],   // Cyan
            [0.4, 0.9, 1.0],    // Light cyan
            [0.1, 0.7, 0.95],   // Sky blue
            [0.5, 0.95, 1.0],   // Bright cyan
            [0.3, 0.8, 0.9],    // Teal-cyan
        ],
    },
    aizawa: {
        colors: [
            [1.0, 0.2, 0.6],    // Hot pink
            [0.9, 0.1, 0.8],    // Magenta
            [1.0, 0.4, 0.7],    // Rose
            [0.8, 0.15, 0.5],   // Deep pink
            [1.0, 0.3, 0.9],    // Bright magenta
        ],
    },
    thomas: {
        colors: [
            [0.05, 0.15, 0.9],  // Deep blue
            [0.1, 0.3, 1.0],    // Royal blue
            [0.0, 0.2, 0.8],    // Navy-blue
            [0.15, 0.4, 1.0],   // Bright blue
            [0.05, 0.25, 0.7],  // Steel blue
        ],
    },
    halvorsen: {
        colors: [
            [1.0, 0.55, 0.05],  // Orange
            [1.0, 0.7, 0.1],    // Gold
            [0.95, 0.4, 0.05],  // Deep orange
            [1.0, 0.8, 0.2],    // Light gold
            [0.9, 0.5, 0.0],    // Amber
        ],
    },
    arneodo: {
        colors: [
            [1.0, 0.15, 0.15],  // Red
            [1.0, 0.3, 0.2],    // Coral-red
            [0.9, 0.1, 0.1],    // Deep red
            [1.0, 0.25, 0.15],  // Orange-red
            [0.85, 0.05, 0.2],  // Crimson
        ],
    },
};

/* ─── Particle system — MANY small single-point particles ──────────── */

const PARTICLE_COUNT = 5000;   // Many particles for density like reference
const TOTAL_POINTS = PARTICLE_COUNT;

interface ParticleState {
    positions: Float32Array;
    colors: Float32Array;
    alphas: Float32Array;
    sizes: Float32Array;
    heads: Float32Array;      // Current actual position in attractor space
    key: AttractorKey;
    normCenter: [number, number, number];
    normScale: number;
}

function initParticles(key: AttractorKey): ParticleState {
    const att = ATTRACTORS[key];
    const palette = ATTRACTOR_PALETTES[key];
    const positions = new Float32Array(TOTAL_POINTS * 3);
    const colors = new Float32Array(TOTAL_POINTS * 3);
    const alphas = new Float32Array(TOTAL_POINTS);
    const sizes = new Float32Array(TOTAL_POINTS);
    const heads = new Float32Array(PARTICLE_COUNT * 3);

    // Pre-compute normalization from reference trajectory
    let p: [number, number, number] = [...att.initial];
    const refPts: [number, number, number][] = [];
    for (let i = 0; i < 8000; i++) {
        p = rk4Step(p, att);
        if (isNaN(p[0]) || Math.abs(p[0]) > 1e4) { p = [...att.initial]; }
        if (i > 2000) refPts.push([...p]);
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
        const jitter = normScale * 0.008;
        const jx = ref[0] + (Math.random() - 0.5) * jitter;
        const jy = ref[1] + (Math.random() - 0.5) * jitter;
        const jz = ref[2] + (Math.random() - 0.5) * jitter;
        heads[i * 3] = jx; heads[i * 3 + 1] = jy; heads[i * 3 + 2] = jz;

        // Normalized position
        positions[i * 3] = (jx - normCenter[0]) / normScale;
        positions[i * 3 + 1] = (jy - normCenter[1]) / normScale;
        positions[i * 3 + 2] = (jz - normCenter[2]) / normScale;

        // Pick a color from palette
        const col = palette.colors[Math.floor(Math.random() * palette.colors.length)];
        const rv = () => (Math.random() - 0.5) * 0.12;
        colors[i * 3] = Math.min(1.0, Math.max(0, col[0] + rv()));
        colors[i * 3 + 1] = Math.min(1.0, Math.max(0, col[1] + rv()));
        colors[i * 3 + 2] = Math.min(1.0, Math.max(0, col[2] + rv()));

        // Alpha — visible but not over-bright for additive
        alphas[i] = 0.5 + Math.random() * 0.5;

        // Size — varied, mostly small with occasional larger ones
        sizes[i] = 0.4 + Math.random() * 1.2;
    }

    return { positions, colors, alphas, sizes, heads, key, normCenter, normScale };
}

function stepParticles(state: ParticleState) {
    const att = ATTRACTORS[state.key];
    const { positions, heads, normCenter, normScale } = state;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const hx = heads[i * 3], hy = heads[i * 3 + 1], hz = heads[i * 3 + 2];
        const next = rk4Step([hx, hy, hz], att);

        if (isNaN(next[0]) || Math.abs(next[0]) > 1e4) {
            const init = att.initial;
            next[0] = init[0] + (Math.random() - 0.5) * 0.1;
            next[1] = init[1] + (Math.random() - 0.5) * 0.1;
            next[2] = init[2] + (Math.random() - 0.5) * 0.1;
        }

        heads[i * 3] = next[0]; heads[i * 3 + 1] = next[1]; heads[i * 3 + 2] = next[2];

        positions[i * 3] = (next[0] - normCenter[0]) / normScale;
        positions[i * 3 + 1] = (next[1] - normCenter[1]) / normScale;
        positions[i * 3 + 2] = (next[2] - normCenter[2]) / normScale;
    }
}

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

/* ─── Vignette shader (blue edge glow like reference) ─────────────── */
const VignetteShader = {
    uniforms: {
        tDiffuse: { value: null },
        uColor: { value: new THREE.Vector3(0.03, 0.05, 0.15) },
        uIntensity: { value: 0.65 },
    },
    vertexShader: `
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform vec3 uColor;
        uniform float uIntensity;
        varying vec2 vUv;
        void main() {
            vec4 tex = texture2D(tDiffuse, vUv);
            float d = distance(vUv, vec2(0.5));
            float vignette = smoothstep(0.35, 0.9, d) * uIntensity;
            tex.rgb = mix(tex.rgb, uColor, vignette);
            gl_FragColor = tex;
        }
    `,
};

/* ─── Particle vertex/fragment shaders ─────────────────────────────── */

const vertexShader = `
    attribute float alpha;
    attribute float size;
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
        vAlpha = alpha;
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * (200.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 12.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        // Soft radial glow — brighter center, fading edge
        float glow = 1.0 - smoothstep(0.0, 0.5, d);
        glow = pow(glow, 1.4);
        gl_FragColor = vec4(vColor, vAlpha * glow * 0.55);
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
        scene.background = new THREE.Color(0x000000);

        // ── Camera — close so attractor fills the screen ──
        const camera = new THREE.PerspectiveCamera(65, w / h, 0.01, 500);
        camera.position.set(0, 0, 1.3);

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 1);
        renderer.domElement.style.display = 'block';
        containerRef.current.appendChild(renderer.domElement);

        // ── Post-processing ──
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        // Bloom — very subtle glow
        const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.12, 0.3, 0.92);
        composer.addPass(bloom);

        // Afterimage — THIS is the key: strong persistence creates flowing curves
        const afterimage = new AfterimagePass();
        afterimage.uniforms['damp'].value = 0.94; // Strong trails = flowing line look
        composer.addPass(afterimage);

        // Vignette — blue edge glow
        const vignettePass = new ShaderPass(VignetteShader);
        composer.addPass(vignettePass);

        // ── Controls ──
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;
        controls.enableZoom = true;
        controls.minDistance = 0.3;
        controls.maxDistance = 6.0;
        controls.autoRotate = false;

        // ── Attractor group ──
        const group = new THREE.Group();
        scene.add(group);
        groupRef.current = group;

        // ── Init particles ──
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
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending, // Additive = glowing curves where particles overlap
            vertexColors: true,
        });

        const pts = new THREE.Points(geo, shaderMat);
        group.add(pts);
        pointsRef.current = pts;
        prevIdxRef.current = attractorIndex;
        readyRef.current = true;

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

            // ── Advance particles ──
            if (stateRef.current && pointsRef.current) {
                stepAccum += dt;
                const stepsPerFrame = Math.min(Math.floor(stepAccum / 0.008), 3);
                for (let s = 0; s < stepsPerFrame; s++) {
                    stepParticles(stateRef.current);
                }
                if (stepsPerFrame > 0) stepAccum = 0;

                const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
                (posAttr.array as Float32Array).set(stateRef.current.positions);
                posAttr.needsUpdate = true;
            }

            // ── Slow continuous rotation ──
            group.rotation.y += 0.002;
            group.rotation.x += 0.0007;
            group.rotation.z = Math.sin(t * 0.3) * 0.03;

            // ── Hand interaction ──
            const m = getMetrics();
            if (m.present) {
                const tgtScale = 0.6 + m.scale * 1.8;
                curScale.current += (tgtScale - curScale.current) * 0.06;
                group.scale.setScalar(curScale.current);

                curBiasY.current += ((m.centerX - 0.5) * 1.2 - curBiasY.current) * 0.04;
                curBiasX.current += ((m.centerY - 0.5) * 0.8 - curBiasX.current) * 0.04;
                group.rotation.y += curBiasY.current * 0.05;
                group.rotation.x += curBiasX.current * 0.05;
            } else {
                curScale.current += (1.0 - curScale.current) * 0.03;
                group.scale.setScalar(curScale.current);
                curBiasX.current *= 0.95;
                curBiasY.current *= 0.95;
            }

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

    /* ── Attractor swap ── */
    useEffect(() => {
        if (prevIdxRef.current === attractorIndex) return;
        if (!readyRef.current || !groupRef.current || !pointsRef.current) return;

        const keys = Object.keys(ATTRACTORS) as AttractorKey[];
        const key = keys[attractorIndex % keys.length];
        const newState = initParticles(key);
        stateRef.current = newState;

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
                background: '#000', zIndex: 0,
            }}
        />
    );
}
