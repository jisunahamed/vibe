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

/* ─── Live particle system ─────────────────────────────────────────── */

const PARTICLE_COUNT = 8000;   // Number of live particles
const TRAIL_LENGTH = 12;     // Each particle = trail of N sub-points
const TOTAL_POINTS = PARTICLE_COUNT * TRAIL_LENGTH;

interface ParticleState {
    positions: Float32Array; // x,y,z per trail point  (TOTAL_POINTS * 3)
    colors: Float32Array;
    alphas: Float32Array; // per-point opacity
    heads: Float32Array; // current head position per particle (PARTICLE_COUNT * 3)
    key: AttractorKey;
    normCenter: [number, number, number];
    normScale: number;
}

/** Initialise particles randomly near the attractor's initial condition */
function initParticles(key: AttractorKey): ParticleState {
    const att = ATTRACTORS[key];
    const positions = new Float32Array(TOTAL_POINTS * 3);
    const colors = new Float32Array(TOTAL_POINTS * 3);
    const alphas = new Float32Array(TOTAL_POINTS);
    const heads = new Float32Array(PARTICLE_COUNT * 3);

    // We pre-compute a normalization reference by iterating a bunch of steps
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
        // Small random offset so they don't all bunch up
        const jx = ref[0] + (Math.random() - 0.5) * normScale * 0.02;
        const jy = ref[1] + (Math.random() - 0.5) * normScale * 0.02;
        const jz = ref[2] + (Math.random() - 0.5) * normScale * 0.02;
        heads[i * 3] = jx; heads[i * 3 + 1] = jy; heads[i * 3 + 2] = jz;

        // Initialise all trail sub-points to the head (they'll spread out quickly)
        for (let t = 0; t < TRAIL_LENGTH; t++) {
            const idx = (i * TRAIL_LENGTH + t) * 3;
            const nx = (jx - normCenter[0]) / normScale;
            const ny = (jy - normCenter[1]) / normScale;
            const nz = (jz - normCenter[2]) / normScale;
            positions[idx] = nx; positions[idx + 1] = ny; positions[idx + 2] = nz;

            // Color: hue based on particle index
            const hue = (i / PARTICLE_COUNT) * 6.28;
            colors[idx] = 0.55 + 0.45 * Math.sin(hue);
            colors[idx + 1] = 0.55 + 0.45 * Math.sin(hue + 2.09);
            colors[idx + 2] = 0.55 + 0.45 * Math.sin(hue + 4.19);

            // Alpha: head is bright, tail fades
            alphas[i * TRAIL_LENGTH + t] = 1.0 - (t / TRAIL_LENGTH);
        }
    }

    return { positions, colors, alphas, heads, key, normCenter, normScale };
}

/** Advance all particles one step along the attractor */
function stepParticles(state: ParticleState) {
    const att = ATTRACTORS[state.key];
    const { positions, heads, alphas, normCenter, normScale } = state;

    for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Shift trail backward (oldest point gets overwritten)
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
            // Reset this particle to initial condition with jitter
            const init = att.initial;
            next[0] = init[0] + (Math.random() - 0.5) * 0.1;
            next[1] = init[1] + (Math.random() - 0.5) * 0.1;
            next[2] = init[2] + (Math.random() - 0.5) * 0.1;
        }

        heads[i * 3] = next[0]; heads[i * 3 + 1] = next[1]; heads[i * 3 + 2] = next[2];

        // Write normalised head position to the first trail slot
        const idx = (i * TRAIL_LENGTH) * 3;
        positions[idx] = (next[0] - normCenter[0]) / normScale;
        positions[idx + 1] = (next[1] - normCenter[1]) / normScale;
        positions[idx + 2] = (next[2] - normCenter[2]) / normScale;
    }
}

/** Single RK4 step using the attractor definition */
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
        scene.background = new THREE.Color(0x020208);

        // ── Camera ──
        const camera = new THREE.PerspectiveCamera(65, w / h, 0.01, 500);
        camera.position.set(0, 0, 2.2);

        // ── Renderer ──
        const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x020208, 1);
        renderer.domElement.style.display = 'block';
        containerRef.current.appendChild(renderer.domElement);

        // ── Post-processing ──
        const composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));

        const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.4, 0.85);
        composer.addPass(bloom);

        const afterimage = new AfterimagePass();
        afterimage.uniforms['damp'].value = 0.92; // Longer trails for flowing particles
        composer.addPass(afterimage);

        // ── Controls ──
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.enablePan = false;

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
        // Note: dynamic — we update positions every frame
        geo.attributes.position.needsUpdate = true;

        const mat = new THREE.PointsMaterial({
            size: 0.006,
            vertexColors: true,
            transparent: true,
            opacity: 0.7,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        });

        const pts = new THREE.Points(geo, mat);
        group.add(pts);
        pointsRef.current = pts;
        prevIdxRef.current = attractorIndex;
        readyRef.current = true;

        // ── Starfield ──
        const STAR_N = 4000;
        const sP = new Float32Array(STAR_N * 3);
        const sC = new Float32Array(STAR_N * 3);
        for (let i = 0; i < STAR_N; i++) {
            const r = 8 + Math.random() * 22;
            const th = Math.random() * Math.PI * 2;
            const ph = Math.acos(2 * Math.random() - 1);
            sP[i * 3] = r * Math.sin(ph) * Math.cos(th);
            sP[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
            sP[i * 3 + 2] = r * Math.cos(ph);
            const b = 0.3 + Math.random() * 0.7;
            sC[i * 3] = b; sC[i * 3 + 1] = b; sC[i * 3 + 2] = b;
        }
        const sGeo = new THREE.BufferGeometry();
        sGeo.setAttribute('position', new THREE.BufferAttribute(sP, 3));
        sGeo.setAttribute('color', new THREE.BufferAttribute(sC, 3));
        const stars = new THREE.Points(sGeo, new THREE.PointsMaterial({
            size: 0.04, vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false,
        }));
        scene.add(stars);

        // ── Debug ──
        if (debug) {
            scene.add(new THREE.AxesHelper(2));
            const bx = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }),
            );
            bx.position.set(1.5, 0, 0);
            scene.add(bx);
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

            // ── Advance live particles (multiple steps per frame for speed) ──
            if (stateRef.current && pointsRef.current) {
                stepAccum += dt;
                // Run ~3 integration steps per frame at 60fps
                const stepsPerFrame = Math.min(Math.floor(stepAccum / 0.005), 5);
                for (let s = 0; s < stepsPerFrame; s++) {
                    stepParticles(stateRef.current);
                }
                if (stepsPerFrame > 0) stepAccum = 0;

                // Upload updated positions to GPU
                const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
                (posAttr.array as Float32Array).set(stateRef.current.positions);
                posAttr.needsUpdate = true;
            }

            // ── Group rotation (moderate speed) ──
            group.rotation.y += 0.006;
            group.rotation.x += 0.002;
            group.rotation.z = Math.sin(t * 0.5) * 0.06;

            // ── Hand interaction ──
            const m = getMetrics();
            if (m.present) {
                const tgtScale = 0.6 + m.scale * 1.8;
                curScale.current += (tgtScale - curScale.current) * 0.08;
                group.scale.setScalar(curScale.current);

                curBiasY.current += ((m.centerX - 0.5) * 1.0 - curBiasY.current) * 0.05;
                curBiasX.current += ((m.centerY - 0.5) * 0.6 - curBiasX.current) * 0.05;
                group.rotation.y += curBiasY.current * 0.03;
                group.rotation.x += curBiasX.current * 0.03;
            } else {
                curScale.current += (1.0 - curScale.current) * 0.04;
                group.scale.setScalar(curScale.current);
                curBiasX.current *= 0.95;
                curBiasY.current *= 0.95;
            }

            // ── Breathe point size ──
            if (pointsRef.current) {
                (pointsRef.current.material as THREE.PointsMaterial).size =
                    0.006 + Math.sin(t * 2.0) * 0.002;
            }

            // ── Rotate stars ──
            stars.rotation.y += 0.0003;
            stars.rotation.x += 0.0001;

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
        const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
        const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
        (posAttr.array as Float32Array).set(newState.positions);
        (colAttr.array as Float32Array).set(newState.colors);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;

        prevIdxRef.current = attractorIndex;
    }, [attractorIndex]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed', inset: 0,
                width: '100vw', height: '100vh',
                background: '#020208', zIndex: 0,
            }}
        />
    );
}
