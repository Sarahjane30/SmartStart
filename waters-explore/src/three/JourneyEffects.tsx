import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { columnProgress } from '../science/chromatography';
import { passes } from '../science/massSpec';
import { protonatedMz, type Molecule } from '../science/molecules';
import { COLUMN_END, COLUMN_START, DETECTOR_X, ION_Y, QUAD_END, QUAD_START, SOURCE_X, segment, type SegmentId } from './layout';

const dot = new THREE.SphereGeometry(1, 10, 8);
const tmp = new THREE.Object3D();

interface StreamProps {
  segments: SegmentId[];
  count: number;
  color: string;
  size?: number;
  speed?: number;
  still?: boolean;
}

/** Particles flowing along one or more tubing segments, looping. */
export function Stream({ segments, count, color, size = 0.035, speed = 0.25, still = false }: StreamProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const curves = useMemo(() => segments.map(segment), [segments]);
  const t = useRef(0);

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!still) t.current += dt * speed;
    for (let i = 0; i < count; i++) {
      const u = (t.current + i / count) % 1;
      const along = u * curves.length;
      const k = Math.min(curves.length - 1, Math.floor(along));
      curves[k].getPointAt(along - k, tmp.position);
      tmp.scale.setScalar(size);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[dot, undefined, count]} frustumCulled={false}>
      <meshBasicMaterial color={color} transparent opacity={0.85} />
    </instancedMesh>
  );
}

interface BandsProps {
  molecules: Molecule[];
  runTime: number;
  followed: Molecule['id'];
}

/** Each compound as a cloud inside the column, advancing at its own speed. */
export function ColumnBands({ molecules, runTime, followed }: BandsProps) {
  const start = useMemo(() => new THREE.Vector3(...COLUMN_START), []);
  const end = useMemo(() => new THREE.Vector3(...COLUMN_END), []);
  return (
    <>
      {molecules.map((m) => {
        const p = columnProgress(m, runTime);
        const done = p >= 1;
        const pos = start.clone().lerp(end, p);
        const focus = m.id === followed;
        return (
          <Band key={m.id} position={pos} color={m.color} spread={0.06 + p * 0.1} visible={runTime > 0 && !done} strong={focus} />
        );
      })}
    </>
  );
}

function Band({ position, color, spread, visible, strong }: { position: THREE.Vector3; color: string; spread: number; visible: boolean; strong: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = 28;
  const seeds = useMemo(() => Array.from({ length: n }, (_, i) => [Math.sin(i * 12.9898) * 0.5, Math.sin(i * 78.233) * 0.5, Math.sin(i * 39.425) * 0.5]), []);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    seeds.forEach(([a, b, c], i) => {
      tmp.position.set(a * spread * 2, b * 0.11, c * 0.11);
      tmp.scale.setScalar(strong ? 0.04 : 0.03);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [seeds, spread, strong]);
  return (
    <instancedMesh ref={ref} args={[dot, undefined, n]} position={position} visible={visible} frustumCulled={false}>
      <meshBasicMaterial color={color} transparent opacity={strong ? 1 : 0.55} />
    </instancedMesh>
  );
}

/** Charged droplets leaving the electrospray needle. */
export function Spray({ color, still = false }: { color: string; still?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = 90;
  const t = useRef(0);
  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!still) t.current += dt * 0.6;
    for (let i = 0; i < n; i++) {
      const u = (t.current + i / n) % 1;
      const ang = i * 2.399;
      const r = u * 0.22 * (1 - u * 0.6);
      tmp.position.set(SOURCE_X - 0.15 + u * 0.6, ION_Y + Math.sin(ang) * r, Math.cos(ang) * r);
      tmp.scale.setScalar(0.022 * (1 - u * 0.5));
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[dot, undefined, n]} frustumCulled={false}>
      <meshBasicMaterial color={color} />
    </instancedMesh>
  );
}

interface QuadProps {
  molecules: Molecule[];
  setMz: number;
  still?: boolean;
}

/** Ions entering the rods: tuned ions fly straight to the detector, the rest spiral out. */
export function QuadIons({ molecules, setMz, still = false }: QuadProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const per = 26;
  const n = per * molecules.length;
  const t = useRef(0);
  const color = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const mesh = ref.current;
    if (!mesh) return;
    if (!still) t.current += dt * 0.35;
    const len = DETECTOR_X - (SOURCE_X + 0.45);
    molecules.forEach((m, mi) => {
      const ok = passes(setMz, protonatedMz(m));
      for (let j = 0; j < per; j++) {
        const i = mi * per + j;
        const u = (t.current + j / per + mi * 0.13) % 1;
        const x = SOURCE_X + 0.45 + u * len;
        const inQuad = Math.max(0, Math.min(1, (x - QUAD_START) / (QUAD_END - QUAD_START)));
        const phase = j * 1.7 + x * 9;
        const r = ok ? 0.03 : 0.03 + inQuad * inQuad * 0.6;
        const lost = !ok && inQuad > 0.85;
        tmp.position.set(x, ION_Y + Math.sin(phase) * r, Math.cos(phase) * r);
        tmp.scale.setScalar(lost ? 0 : 0.03);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        color.set(m.color);
        mesh.setColorAt(i, color);
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ref} args={[dot, undefined, n]} frustumCulled={false}>
      <meshBasicMaterial />
    </instancedMesh>
  );
}
