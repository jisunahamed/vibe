export type AttractorKey = 'lorenz' | 'aizawa' | 'thomas' | 'halvorsen' | 'arneodo';

interface AttractorDef {
    name: string;
    derive: (p: [number, number, number], params: any) => [number, number, number];
    params: any;
    dt: number;
    initial: [number, number, number];
}

export const ATTRACTORS: Record<AttractorKey, AttractorDef> = {
    lorenz: {
        name: 'Lorenz',
        params: { sigma: 10, rho: 28, beta: 8 / 3 },
        dt: 0.01,
        initial: [0.1, 0, 0],
        derive: ([x, y, z], { sigma, rho, beta }) => [
            sigma * (y - x),
            x * (rho - z) - y,
            x * y - beta * z,
        ],
    },
    aizawa: {
        name: 'Aizawa',
        params: { a: 0.95, b: 0.7, c: 0.6, d: 3.5, e: 0.25, f: 0.1 },
        dt: 0.01,
        initial: [0.1, 0, 0],
        derive: ([x, y, z], { a, b, c, d, e, f }) => [
            (z - b) * x - d * y,
            d * x + (z - b) * y,
            c + a * z - (z ** 3 / 3) - (x ** 2 + y ** 2) * (1 + e * z) + f * z * (x ** 3),
        ],
    },
    thomas: {
        name: 'Thomas',
        params: { b: 0.2081 },
        dt: 0.1,
        initial: [0.1, 0, 0],
        derive: ([x, y, z], { b }) => [
            Math.sin(y) - b * x,
            Math.sin(z) - b * y,
            Math.sin(x) - b * z,
        ],
    },
    halvorsen: {
        name: 'Halvorsen',
        params: { a: 1.89 },
        dt: 0.01,
        initial: [0.1, 0, 0],
        derive: ([x, y, z], { a }) => [
            -a * x - 4 * y - 4 * z - y * y,
            -a * y - 4 * z - 4 * x - z * z,
            -a * z - 4 * x - 4 * y - x * x,
        ],
    },
    arneodo: {
        name: 'Arneodo',
        params: { a: -0.6, b: 8.0, c: -1.0 },
        dt: 0.01,
        initial: [0.1, 0.1, 0.1],
        derive: ([x, y, z], { a, b, c }) => [
            y,
            z,
            -a * x - b * y - z + c * (x ** 3),
        ],
    },
};

const cache = new Map<string, { positions: Float32Array; colors: Float32Array; name: string }>();

export function generateAttractorPoints(key: AttractorKey, count: number) {
    const cacheKey = `${key}-${count}`;
    if (cache.has(cacheKey)) return cache.get(cacheKey)!;

    const attractor = ATTRACTORS[key];
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    let p: [number, number, number] = [...attractor.initial];

    // Warmup
    for (let i = 0; i < 1000; i++) {
        p = rk4(p, attractor.derive, attractor.params, attractor.dt);
    }

    let min: [number, number, number] = [Infinity, Infinity, Infinity];
    let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

    for (let i = 0; i < count; i++) {
        p = rk4(p, attractor.derive, attractor.params, attractor.dt);

        // Safety check
        if (isNaN(p[0]) || isNaN(p[1]) || isNaN(p[2]) || Math.abs(p[0]) > 1000) {
            break;
        }

        positions[i * 3 + 0] = p[0];
        positions[i * 3 + 1] = p[1];
        positions[i * 3 + 2] = p[2];

        min[0] = Math.min(min[0], p[0]);
        min[1] = Math.min(min[1], p[1]);
        min[2] = Math.min(min[2], p[2]);
        max[0] = Math.max(max[0], p[0]);
        max[1] = Math.max(max[1], p[1]);
        max[2] = Math.max(max[2], p[2]);

        const t = i / count;
        colors[i * 3 + 0] = 0.5 + 0.4 * Math.sin(t * 8);
        colors[i * 3 + 1] = 0.5 + 0.4 * Math.sin(t * 8 + 2);
        colors[i * 3 + 2] = 0.5 + 0.4 * Math.sin(t * 8 + 4);
    }

    const center = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const extent = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    const maxExtent = Math.max(...extent) || 1;

    for (let i = 0; i < count; i++) {
        // Center and Normalize
        positions[i * 3 + 0] = (positions[i * 3 + 0] - center[0]) / maxExtent;
        positions[i * 3 + 1] = (positions[i * 3 + 1] - center[1]) / maxExtent;
        positions[i * 3 + 2] = (positions[i * 3 + 2] - center[2]) / maxExtent;

        // Jitter a fraction for "halo" effect
        if (i % 20 === 0) {
            positions[i * 3 + 0] += (Math.random() - 0.5) * 0.05;
            positions[i * 3 + 1] += (Math.random() - 0.5) * 0.05;
            positions[i * 3 + 2] += (Math.random() - 0.5) * 0.05;
        }
    }

    const result = { positions, colors, name: attractor.name };
    cache.set(cacheKey, result);
    return result;
}

function rk4(
    p: [number, number, number],
    f: (p: [number, number, number], params: any) => [number, number, number],
    params: any,
    dt: number
): [number, number, number] {
    const k1 = f(p, params);
    const k2 = f(add(p, mul(k1, 0.5 * dt)), params);
    const k3 = f(add(p, mul(k2, 0.5 * dt)), params);
    const k4 = f(add(p, mul(k3, dt)), params);

    return add(p, mul(add(add(k1, mul(k2, 2)), add(mul(k3, 2), k4)), dt / 6));
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function mul(a: [number, number, number], s: number): [number, number, number] {
    return [a[0] * s, a[1] * s, a[2] * s];
}
