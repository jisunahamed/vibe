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

/* ─── Color palettes — warm/neon tones like the reference ─────────── */
const ATTRACTOR_PALETTES: Record<AttractorKey, { colors: [number, number, number][] }> = {
    lorenz: {
        colors: [
            [1.0, 0.45, 0.1],   // Warm orange
            [1.0, 0.7, 0.15],   // Gold
            [0.95, 0.3, 0.2],   // Coral
            [1.0, 0.85, 0.4],   // Light gold
            [0.85, 0.25, 0.15], // Deep orange
        ],
    },
    aizawa: {
        colors: [
            [0.3, 0.6, 1.0],    // Sky blue
            [0.5, 0.3, 1.0],    // Purple
            [0.2, 0.9, 0.8],    // Cyan
            [0.7, 0.4, 1.0],    // Lavender
            [0.1, 0.7, 1.0],    // Electric blue
        ],
    },
    thomas: {
        colors: [
            [0.1, 1.0, 0.5],    // Neon green
            [0.4, 1.0, 0.3],    // Lime
            [0.0, 0.8, 0.6],    // Emerald
            [0.6, 1.0, 0.2],    // Yellow-green
            [0.2, 0.9, 0.4],    // Spring green
        ],
    },
    halvorsen: {
        colors: [
            [1.0, 0.45, 0.1],   // Orange (matching reference)
            [1.0, 0.7, 0.15],   // Gold
            [0.95, 0.3, 0.2],   // Coral
            [1.0, 0.55, 0.0],   // Amber
            [0.85, 0.25, 0.15], // Deep orange-red
        ],
    },
    arneodo: {
        colors: [
            [1.0, 0.2, 0.5],    // Hot pink
            [1.0, 0.4, 0.7],    // Rose
            [0.9, 0.1, 0.4],    // Crimson-pink
            [1.0, 0.6, 0.8],    // Soft pink
            [0.8, 0.15, 0.6],   // Magenta
        ],
    },
};

/* ─── Live particle system ─────────────────────────────────────────── */

const PARTICLE_COUNT = 1500;   // Fewer particles = no white saturation with additive
const TRAIL_LENGTH = 6;        // Short trail for speed
const TOTAL_POINTS = PARTICLE_COUNT * TRAIL_LENGTH;

interface ParticleState {
    positions: Float32Array;
    colors: Float32Array;
    alphas: Float32Array;
    sizes: Float32Array;
    heads: Float32Array;
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

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        const ref = refPts[Math.floor(Math.random() * refPts.length)];
        const jx = ref[0] + (Math.random() - 0.5) * normScale * 0.015;
        const jy = ref[1] + (Math.random() - 0.5) * normScale * 0.015;
        const jz = ref[2] + (Math.random() - 0.5) * normScale * 0.015;
        heads[i * 3] = jx; heads[i * 3 + 1] = jy; heads[i * 3 + 2] = jz;

        // Pick a random color from the palette
        const col = palette.colors[Math.floor(Math.random() * palette.colors.length)];
        // Add slight random variation
        const rv = () => (Math.random() - 0.5) * 0.15;

        // Random base size for this particle (large variation like the reference)
        const baseSize = 0.6 + Math.random() * 1.8; // 0.6 to 2.4

        for (let t = 0; t < TRAIL_LENGTH; t++) {
            const idx = (i * TRAIL_LENGTH + t) * 3;
            const nx = (jx - normCenter[0]) / normScale;
            const ny = (jy - normCenter[1]) / normScale;
            const nz = (jz - normCenter[2]) / normScale;
            positions[idx] = nx; positions[idx + 1] = ny; positions[idx + 2] = nz;

            colors[idx] = Math.min(1.0, col[0] + rv());
            colors[idx + 1] = Math.min(1.0, col[1] + rv());
            colors[idx + 2] = Math.min(1.0, col[2] + rv());

            // Alpha: head bright, tail fades
            const trailFade = 1.0 - (t / TRAIL_LENGTH);
            alphas[i * TRAIL_LENGTH + t] = trailFade * trailFade;

            // Size: head is large, tail shrinks dramatically
            sizes[i * TRAIL_LENGTH + t] = baseSize * (t === 0 ? 1.0 : Math.max(0.15, trailFade * 0.6));
        }
    }

    return { positions, colors, alphas, sizes, heads, key, normCenter, normScale };
}

function stepParticles(state: ParticleState) {
    const att = ATTRACTORS[state.key];
    const { positions, heads, normCenter, normScale } = state;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        for (let t = TRAIL_LENGTH - 1; t > 0; t--) {
            const dst = (i * TRAIL_LENGTH + t) * 3;
            const src = (i * TRAIL_LENGTH + t - 1) * 3;
            positions[dst] = positions[src];
            positions[dst + 1] = positions[src + 1];
            positions[dst + 2] = positions[src + 2];
        }

        const hx = heads[i * 3], hy = heads[i * 3 + 1], hz = heads[i * 3 + 2];
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
        uColor: { value: new THREE.Vector3(0.05, 0.08, 0.2) }, // Dark blue
        uIntensity: { value: 0.7 },
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
            float vignette = smoothstep(0.3, 0.85, d) * uIntensity;
            tex.rgb = mix(tex.rgb, uColor, vignette);
            gl_FragColor = tex;
        }
    `,
};

/* ─── Custom particle shader — soft glowing disks ──────────────── */

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
        float breatheSize = size * (1.0 + uBreathe * 0.15);
        // Larger size divisor = bigger particles on screen
        gl_PointSize = breatheSize * (300.0 / -mvPosition.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 28.0);
        gl_Position = projectionMatrix * mvPosition;
    }
`;

const fragmentShader = `
    varying float vAlpha;
    varying vec3 vColor;

    void main() {
        float d = length(gl_PointCoord - vec2(0.5));
        if (d > 0.5) discard;
        // Soft radial falloff — glowing disk feel
        float glow = 1.0 - smoothstep(0.0, 0.5, d);
        glow = pow(glow, 2.0); // Sharper falloff = less overlap bleed
        gl_FragColor = vec4(vColor * 0.85, vAlpha * glow * 0.45);
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
        scene.background = new THREE.Color(0x000000); // Pure black like reference

        // ── Camera — closer like the reference so attractor fills screen ──
        const camera = new THREE.PerspectiveCamera(65, w / h, 0.01, 500);
        camera.position.set(0, 0, 1.6); // Close!

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 1);
        renderer.domElement.style.display = 'block';
        containerRef.current.appendChild(renderer.domElement);

        // ── Post-processing pipeline (like reference) ──
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        // Bloom — strong neon glow
        const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.35, 0.35, 0.85);
        composer.addPass(bloom);

        // Afterimage — smooth motion trails (the key "fusion" effect)
        const afterimage = new AfterimagePass();
        afterimage.uniforms['damp'].value = 0.82; // Moderate trails — prevents white buildup
        composer.addPass(afterimage);

        // Vignette — blue-tinted edges like reference
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
            blending: THREE.AdditiveBlending, // Additive for neon glow (fewer particles = safe)
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

            // ── Advance live particles ──
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

            // ── Group rotation (slow + wobble) ──
            group.rotation.y += 0.003;
            group.rotation.x += 0.001;
            group.rotation.z = Math.sin(t * 0.4) * 0.05;

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

            // ── Breathing point size ──
            shaderMat.uniforms.uBreathe.value = Math.sin(t * 1.5) * 0.5;

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
