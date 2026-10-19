import { Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { AREA_COLORS, ORDER, PART_LAYOUT, PEOPLE_NODES, SITES, type ChapterId } from '../content/machine';
import { MiniGlobe } from './MiniGlobe';
import { MoleculeModel } from './MoleculeModel';
import { MOLECULES } from '../science/molecules';

interface Controls extends THREE.EventDispatcher<{ start: object }> {
  target: THREE.Vector3;
  update(): void;
  enabled: boolean;
}

function CameraRig({ active }: { active: ChapterId | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const flying = useRef(true);
  const goal = useMemo(() => {
    if (!active) return { pos: new THREE.Vector3(0, 0.4, 7.2), target: new THREE.Vector3(0, 0, 0) };
    const p = PART_LAYOUT[active].pos;
    const zoom = active === 'you' ? 1.1 : active === 'technology' ? 1.35 : 1.55;
    return {
      pos: new THREE.Vector3(p[0] * 0.35, p[1] * 0.4 + 0.8, 5.2 / zoom + 1.2),
      target: new THREE.Vector3(p[0] * 0.55, p[1] * 0.55, p[2] * 0.3),
    };
  }, [active]);

  useEffect(() => {
    flying.current = true;
  }, [active]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (flying.current = false);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!controls || !flying.current) return;
    const k = 1 - Math.exp(-dt * 2.4);
    camera.position.lerp(goal.pos, k);
    controls.target.lerp(goal.target, k);
    controls.update();
  });
  return null;
}

function Column({ lit }: { lit: number }) {
  return (
    <group>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.18, 0.18, 1.5, 28, 1, true]} />
        <meshPhysicalMaterial color="#cfe9ff" transmission={0.7} roughness={0.1} transparent opacity={0.35 + lit * 0.3} side={THREE.DoubleSide} />
      </mesh>
      {[-0.75, 0.75].map((x) => (
        <mesh key={x} position={[x, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.22, 0.22, 0.12, 6]} />
          <meshStandardMaterial color="#94a3b8" metalness={0.5} roughness={0.3} />
        </mesh>
      ))}
      {[0, 1, 2].map((i) => (
        <mesh key={i} position={[-0.4 + i * 0.4, 0, 0]}>
          <sphereGeometry args={[0.06, 12, 10]} />
          <meshBasicMaterial color={AREA_COLORS[i]} />
        </mesh>
      ))}
    </group>
  );
}

function Chambers({ lit, open }: { lit: number; open: number }) {
  return (
    <group>
      {([-0.55, 0.55] as const).map((x, i) => (
        <mesh key={x} position={[x, 0, 0]}>
          <boxGeometry args={[0.9, 0.7 + open * 0.15, 0.7]} />
          <meshStandardMaterial
            color={i ? '#2a1848' : '#0d2a44'}
            emissive={i ? '#aa80ff' : '#60d6ff'}
            emissiveIntensity={0.2 + lit * 0.55}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}
    </group>
  );
}

function ImpactBurst({ lit, area }: { lit: number; area: number }) {
  return (
    <group>
      {AREA_COLORS.map((c, i) => {
        const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const on = area === i;
        return (
          <mesh key={c} position={[Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0]}>
            <sphereGeometry args={[on ? 0.16 : 0.11, 16, 12]} />
            <meshBasicMaterial color={c} transparent opacity={0.45 + lit * 0.5 + (on ? 0.3 : 0)} />
          </mesh>
        );
      })}
      <mesh>
        <sphereGeometry args={[0.2, 20, 16]} />
        <meshStandardMaterial color="#e3ebff" emissive="#60d6ff" emissiveIntensity={0.3 + lit * 0.4} />
      </mesh>
    </group>
  );
}

function PeopleRing({ lit, node }: { lit: number; node: string | null }) {
  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.7, 0.02, 8, 48]} />
        <meshBasicMaterial color="#60d6ff" transparent opacity={0.25 + lit * 0.35} />
      </mesh>
      {PEOPLE_NODES.map((n, i) => {
        const a = (i / PEOPLE_NODES.length) * Math.PI * 2 - Math.PI / 2;
        const on = node === n.id;
        return (
          <mesh key={n.id} position={[Math.cos(a) * 0.7, Math.sin(a) * 0.7, 0]}>
            <sphereGeometry args={[on ? 0.09 : 0.055, 12, 10]} />
            <meshBasicMaterial color={on ? '#60d6ff' : '#9db6ff'} />
          </mesh>
        );
      })}
      <mesh>
        <sphereGeometry args={[0.18, 16, 12]} />
        <meshStandardMaterial color="#0b1026" emissive="#60d6ff" emissiveIntensity={0.5 + lit * 0.4} />
      </mesh>
    </group>
  );
}

function YouCore({ lit, stage }: { lit: number; stage: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.4;
  });
  return (
    <group scale={0.7 + stage * 0.08}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.35, 1]} />
        <meshStandardMaterial color="#ffc678" emissive="#ffc678" emissiveIntensity={0.4 + lit * 0.8} wireframe={stage < 2} />
      </mesh>
      <mesh scale={1.4}>
        <icosahedronGeometry args={[0.35, 0]} />
        <meshBasicMaterial color="#ffc678" transparent opacity={0.12 + lit * 0.15} />
      </mesh>
    </group>
  );
}

function PartLabel({ id, active, hover, hidden, onEnter, onLeave, onClick }: {
  id: ChapterId;
  active: ChapterId | null;
  hover: ChapterId | null;
  hidden: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onClick: () => void;
}) {
  const idx = String(ORDER.indexOf(id) + 1).padStart(2, '0');
  const on = active === id || hover === id;
  const dim = active !== null && active !== id;
  return (
    <Html position={[0, PART_LAYOUT[id].pos[1] > 0 ? 1.05 : -0.95, 0]} center zIndexRange={[30, 0]} style={{ pointerEvents: hidden ? 'none' : 'auto', display: hidden ? 'none' : undefined }}>
      <button
        type="button"
        className={`wm-label${on ? ' is-hover' : ''}${dim ? ' is-dim' : ''}`}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        onClick={onClick}
      >
        <span className="wm-label-idx">{idx}</span>
        {PART_LAYOUT[id].label}
      </button>
    </Html>
  );
}

export interface MachineProps {
  active: ChapterId | null;
  hover: ChapterId | null;
  free: boolean;
  chamber: number;
  area: number;
  site: string | null;
  node: string | null;
  youStage: number;
  still: boolean;
  showLabels: boolean;
  onHover: (id: ChapterId | null) => void;
  onSelect: (id: ChapterId) => void;
  onSite: (id: string) => void;
}

export function MachineScene({
  active,
  hover,
  free,
  chamber,
  area,
  site,
  node,
  youStage,
  still,
  showLabels,
  onHover,
  onSelect,
  onSite: _onSite,
}: MachineProps) {
  void _onSite;
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (root.current && !still && !active && free) root.current.rotation.y += dt * 0.04;
  });

  const lit = (id: ChapterId) => (active === id || hover === id ? 1 : active ? 0.2 : 0.65);

  return (
    <>
      <color attach="background" args={['#060b1e']} />
      <fog attach="fog" args={['#060b1e', 10, 22]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[4, 6, 5]} intensity={1.2} />
      <pointLight position={[-4, 2, 4]} intensity={20} color="#60d6ff" />
      <pointLight position={[4, -2, 2]} intensity={12} color="#aa80ff" />

      <group ref={root}>
        {/* Core machine frame */}
        <mesh position={[0, 0, -0.2]}>
          <torusGeometry args={[2.6, 0.015, 8, 80]} />
          <meshBasicMaterial color="#60d6ff" transparent opacity={0.18} />
        </mesh>
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.1, 0.01, 8, 80]} />
          <meshBasicMaterial color="#aa80ff" transparent opacity={0.12} />
        </mesh>

        {(Object.keys(PART_LAYOUT) as ChapterId[]).map((id) => {
          const { pos } = PART_LAYOUT[id];
          return (
            <group
              key={id}
              position={pos}
              onPointerOver={(e) => {
                e.stopPropagation();
                onHover(id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                onHover(null);
                document.body.style.cursor = '';
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(id);
              }}
            >
              {id === 'science' && <Column lit={lit(id)} />}
              {id === 'technology' && <Chambers lit={lit(id)} open={active === 'technology' ? (chamber >= 0 ? 1 : 0.35) : 0} />}
              {id === 'impact' && <ImpactBurst lit={lit(id)} area={active === 'impact' ? area : -1} />}
              {id === 'world' && (
                <group scale={0.55}>
                  <MiniGlobe sites={SITES} active={site} still={still || active !== 'world'} />
                </group>
              )}
              {id === 'people' && <PeopleRing lit={lit(id)} node={active === 'people' ? node : null} />}
              {id === 'you' && <YouCore lit={lit(id)} stage={youStage} />}
              <PartLabel
                id={id}
                active={active}
                hover={hover}
                hidden={!showLabels}
                onEnter={() => onHover(id)}
                onLeave={() => onHover(null)}
                onClick={() => onSelect(id)}
              />
            </group>
          );
        })}

        {/* Soft binding strands */}
        <lineSegments>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[
                new Float32Array(
                  ORDER.flatMap((id, i) => {
                    const a = PART_LAYOUT[id].pos;
                    const b = PART_LAYOUT[ORDER[(i + 1) % ORDER.length]].pos;
                    return [...a, ...b];
                  }),
                ),
                3,
              ]}
            />
          </bufferGeometry>
          <lineBasicMaterial color="#60d6ff" transparent opacity={0.12} />
        </lineSegments>

        {!active && (
          <group position={[0, 0.2, 0.8]}>
            <MoleculeModel molecule={MOLECULES[1]} scale={0.12} glow={0.4} />
          </group>
        )}
      </group>

      <OrbitControls makeDefault enableDamping enablePan={false} enabled={free || !active} minDistance={3.5} maxDistance={12} maxPolarAngle={Math.PI * 0.48} />
      <CameraRig active={active} />

    </>
  );
}
