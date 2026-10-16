import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Site } from '../content/chapters';

const R = 2;

const latLonToVec = (lat: number, lon: number, r = R): THREE.Vector3 => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
};

function Graticule() {
  const geo = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let lat = -60; lat <= 60; lat += 30) {
      for (let lon = -180; lon < 180; lon += 4) pts.push(latLonToVec(lat, lon, R + 0.002), latLonToVec(lat, lon + 4, R + 0.002));
    }
    for (let lon = -180; lon < 180; lon += 30) {
      for (let lat = -88; lat < 88; lat += 4) pts.push(latLonToVec(lat, lon, R + 0.002), latLonToVec(lat + 4, lon, R + 0.002));
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, []);
  return (
    <lineSegments geometry={geo}>
      <lineBasicMaterial color="#38bdf8" transparent opacity={0.3} />
    </lineSegments>
  );
}

function Arc({ from, to }: { from: Site; to: Site }) {
  const geo = useMemo(() => {
    const a = latLonToVec(from.lat, from.lon);
    const b = latLonToVec(to.lat, to.lon);
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R + a.distanceTo(b) * 0.35);
    return new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(a, mid, b), 48, 0.008, 6, false);
  }, [from, to]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial color="#7dd3fc" transparent opacity={0.7} />
    </mesh>
  );
}

const world = new THREE.Vector3();

function SiteLabel({ site, on, onSelect }: { site: Site; on: boolean; onSelect: (id: string) => void }) {
  const anchor = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const [facing, setFacing] = useState(true);
  useFrame(() => {
    if (!anchor.current) return;
    anchor.current.getWorldPosition(world);
    const f = world.normalize().dot(camera.position.clone().normalize()) > 0.2;
    if (f !== facing) setFacing(f);
  });
  return (
    <group ref={anchor}>
      <Html center zIndexRange={[10, 0]} style={{ display: on && facing ? undefined : 'none' }}>
        <button type="button" className={`scene-tag scene-tag--button${on ? ' is-active' : ''}`} onClick={() => onSelect(site.id)}>
          {site.name}
        </button>
      </Html>
    </group>
  );
}

interface Props {
  sites: Site[];
  active: string | null;
  onSelect: (id: string) => void;
  still: boolean;
}

export function GlobeScene({ sites, active, onSelect, still }: Props) {
  const spin = useRef<THREE.Group>(null);
  const hub = sites[0];
  const focus = sites.find((s) => s.id === active);
  useFrame((_, dt) => {
    const g = spin.current;
    if (!g) return;
    if (focus) {
      const p = latLonToVec(focus.lat, focus.lon);
      const goal = Math.atan2(-p.x, p.z);
      const d = Math.atan2(Math.sin(goal - g.rotation.y), Math.cos(goal - g.rotation.y));
      g.rotation.y += d * (still ? 1 : 1 - Math.exp(-dt * 3));
    } else if (!still) {
      g.rotation.y += dt * 0.06;
    }
  });

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 3, 5]} intensity={1.2} />
      <group ref={spin} rotation={[0.4, -1.45, 0]}>
        <mesh>
          <sphereGeometry args={[R, 64, 48]} />
          <meshStandardMaterial color="#0f2a44" roughness={0.9} emissive="#0c4a6e" emissiveIntensity={0.25} />
        </mesh>
        <mesh scale={1.06} raycast={() => null}>
          <sphereGeometry args={[R, 48, 32]} />
          <meshBasicMaterial color="#38bdf8" transparent opacity={0.06} side={THREE.BackSide} />
        </mesh>
        <Graticule />
        {sites.slice(1).map((s) => (
          <Arc key={s.id} from={hub} to={s} />
        ))}
        {sites.map((s) => {
          const p = latLonToVec(s.lat, s.lon, R + 0.02);
          const on = active === s.id;
          return (
            <group key={s.id} position={p}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(s.id);
                }}
              >
                <sphereGeometry args={[on ? 0.07 : 0.05, 16, 12]} />
                <meshBasicMaterial color={on ? '#fbbf24' : '#e0f2fe'} />
              </mesh>
              <group position={p.clone().normalize().multiplyScalar(0.22)}>
                <SiteLabel site={s} on={on} onSelect={onSelect} />
              </group>
            </group>
          );
        })}
      </group>
      <OrbitControls enablePan={false} enableZoom={false} rotateSpeed={0.5} />
    </>
  );
}
