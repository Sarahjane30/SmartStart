import { Float } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useRef } from 'react';
import type * as THREE from 'three';
import { MOLECULES } from '../science/molecules';
import { MoleculeModel } from './MoleculeModel';

const PLACES: [number, number, number][] = [
  [-1.6, 1.4, -1.2],
  [0.2, -1.3, 0.4],
  [1.9, 1.1, -1.8],
];

export function HeroScene({ still }: { still: boolean }) {
  const root = useRef<THREE.Group>(null);
  const width = useThree((s) => s.viewport.width);
  const wide = width > 9;
  useFrame((state, dt) => {
    if (!root.current || still) return;
    root.current.rotation.y += dt * 0.08;
    root.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.2) * 0.08;
  });

  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 5]} intensity={1.4} />
      <pointLight position={[-6, -2, 4]} intensity={30} color="#38bdf8" />
      <group position={[wide ? width * 0.24 : 0, wide ? 0 : -1.6, wide ? 0 : -2]}>
      <group ref={root}>
        {MOLECULES.map((m, i) => (
          <Float key={m.id} speed={still ? 0 : 1.2} rotationIntensity={still ? 0 : 0.8} floatIntensity={still ? 0 : 1}>
            <group position={PLACES[i]} rotation={[0.3 * i, 0.8 * i, 0]}>
              <MoleculeModel molecule={m} scale={0.42} glow={0.4} />
            </group>
          </Float>
        ))}
      </group>
      </group>
    </>
  );
}
