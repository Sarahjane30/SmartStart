import { useMemo } from 'react';
import * as THREE from 'three';
import { ELEMENT_COLOR, type Molecule } from '../science/molecules';

const UP = new THREE.Vector3(0, 1, 0);
const sphere = new THREE.SphereGeometry(1, 20, 14);
const rod = new THREE.CylinderGeometry(1, 1, 1, 10);

interface Props {
  molecule: Molecule;
  scale?: number;
  glow?: number;
}

export function MoleculeModel({ molecule, scale = 1, glow = 0 }: Props) {
  const sticks = useMemo(() => {
    const out: { pos: THREE.Vector3; quat: THREE.Quaternion; len: number }[] = [];
    for (const [i, j, order] of molecule.bonds) {
      const a = molecule.atoms[i];
      const b = molecule.atoms[j];
      const va = new THREE.Vector3(a.x, a.y, a.z);
      const vb = new THREE.Vector3(b.x, b.y, b.z);
      const dir = vb.clone().sub(va);
      const len = dir.length();
      const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.clone().normalize());
      const side = new THREE.Vector3(-dir.y, dir.x, 0).normalize().multiplyScalar(0.12);
      const mid = va.clone().add(vb).multiplyScalar(0.5);
      if (order === 2) {
        out.push({ pos: mid.clone().add(side), quat, len });
        out.push({ pos: mid.clone().sub(side), quat, len });
      } else {
        out.push({ pos: mid, quat, len });
      }
    }
    return out;
  }, [molecule]);

  return (
    <group scale={scale}>
      {molecule.atoms.map((a, i) => (
        <mesh key={i} geometry={sphere} position={[a.x, a.y, a.z]} scale={a.el === 'C' ? 0.34 : 0.4}>
          <meshStandardMaterial
            color={ELEMENT_COLOR[a.el]}
            emissive={molecule.color}
            emissiveIntensity={glow * 0.6}
            roughness={0.35}
            metalness={0.1}
          />
        </mesh>
      ))}
      {sticks.map((s, i) => (
        <mesh key={i} geometry={rod} position={s.pos} quaternion={s.quat} scale={[0.08, s.len, 0.08]}>
          <meshStandardMaterial color={molecule.color} emissive={molecule.color} emissiveIntensity={0.25 + glow * 0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}
