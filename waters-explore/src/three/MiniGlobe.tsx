import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { Site } from '../content/machine';

const R = 1.1;

export const latLonToVec = (lat: number, lon: number, r = R): THREE.Vector3 => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

interface Props {
  sites: Site[];
  active: string | null;
  still: boolean;
}

/** Compact globe for the overview machine — no orbit controls of its own. */
export function MiniGlobe({ sites, active, still }: Props) {
  const spin = useRef<THREE.Group>(null);
  const hub = sites[0];
  const focus = sites.find((s) => s.id === active);

  const grid = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 6) pts.push(latLonToVec(lat, lon), latLonToVec(lat, lon + 6));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -88; lat < 88; lat += 6) pts.push(latLonToVec(lat, lon), latLonToVec(lat + 6, lon));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);

  const arcs = useMemo(
    () =>
      sites.slice(1).map((s) => {
        const a = latLonToVec(hub.lat, hub.lon);
        const b = latLonToVec(s.lat, s.lon);
        const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R + a.distanceTo(b) * 0.3);
        return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 32, 0.01, 5, false);
      }),
    [sites, hub],
  );

  useFrame((_, dt) => {
    const g = spin.current;
    if (!g) return;
    if (focus) {
      const p = latLonToVec(focus.lat, focus.lon);
      const goal = Math.atan2(-p.x, p.z);
      const d = Math.atan2(Math.sin(goal - g.rotation.y), Math.cos(goal - g.rotation.y));
      g.rotation.y += d * (still ? 1 : 1 - Math.exp(-dt * 3));
    } else if (!still) {
      g.rotation.y += dt * 0.15;
    }
  });

  return (
    <group ref={spin} rotation={[0.4, -1.45, 0]}>
      <mesh>
        <sphereGeometry args={[R, 48, 36]} />
        <meshStandardMaterial color="#0f2a44" roughness={0.9} emissive="#0c4a6e" emissiveIntensity={0.3} />
      </mesh>
      <lineSegments geometry={grid}>
        <lineBasicMaterial color="#60d6ff" transparent opacity={0.28} />
      </lineSegments>
      {arcs.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.65} />
        </mesh>
      ))}
      {sites.map((s) => {
        const p = latLonToVec(s.lat, s.lon, R + 0.03);
        const on = active === s.id;
        return (
          <mesh key={s.id} position={p}>
            <sphereGeometry args={[on ? 0.07 : 0.045, 12, 10]} />
            <meshBasicMaterial color={on ? '#ffc678' : '#e0f2fe'} />
          </mesh>
        );
      })}
    </group>
  );
}
