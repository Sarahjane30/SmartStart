import { ContactShadows, Html, OrbitControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { JourneyStepId, PartId } from '../content/instrument';
import { signalAt } from '../science/chromatography';
import { MOLECULES, moleculeById, type Molecule } from '../science/molecules';
import { Instrument } from './Instrument';
import { ColumnBands, QuadIons, Spray, Stream } from './JourneyEffects';
import { FRONT_Z, MODULE_Y, STACK_X, cameraFor, fitToAspect, type CameraGoal } from './layout';
import { MoleculeModel } from './MoleculeModel';

interface Controls extends THREE.EventDispatcher<{ start: object }> {
  target: THREE.Vector3;
  update(): void;
}

function CameraRig({ goal }: { goal: CameraGoal }) {
  const controls = useThree((s) => s.controls) as unknown as Controls | null;
  const camera = useThree((s) => s.camera);
  const flying = useRef(true);
  const pos = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());

  useEffect(() => {
    pos.current.set(...goal.position);
    target.current.set(...goal.target);
    flying.current = true;
  }, [goal]);

  useEffect(() => {
    if (!controls) return;
    const stop = () => (flying.current = false);
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, dt) => {
    if (!flying.current || !controls) return;
    const k = 1 - Math.exp(-dt * 3);
    camera.position.lerp(pos.current, k);
    controls.target.lerp(target.current, k);
    controls.update();
    if (camera.position.distanceTo(pos.current) < 0.01 && controls.target.distanceTo(target.current) < 0.01) flying.current = false;
  });
  return null;
}

function UvFlash({ intensity }: { intensity: number }) {
  return (
    <mesh position={[STACK_X + 0.4, MODULE_Y.uv, FRONT_Z + 0.03]}>
      <circleGeometry args={[0.13 + intensity * 0.08, 24]} />
      <meshBasicMaterial color="#c4b5fd" transparent opacity={Math.min(1, intensity)} depthWrite={false} />
    </mesh>
  );
}

function Picker({ followed, onPick, hidden }: { followed: Molecule['id']; onPick: (id: Molecule['id']) => void; hidden: boolean }) {
  const root = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    root.current?.children.forEach((c) => (c.rotation.y += dt * 0.4));
  });
  return (
    <group ref={root} position={[0.6, 3.9, 0.8]} visible={!hidden}>
      {MOLECULES.map((m, i) => (
        <group
          key={m.id}
          position={[(i - 1) * 1.7, 0, 0]}
          onClick={(e) => {
            if (hidden) return;
            e.stopPropagation();
            onPick(m.id);
          }}
          scale={followed === m.id ? 1.25 : 1}
        >
          <MoleculeModel molecule={m} scale={0.14} glow={followed === m.id ? 1 : 0.1} />
          <Html position={[0, -0.75, 0]} center style={{ display: hidden ? 'none' : undefined }}>
            <span className={`scene-tag${followed === m.id ? ' is-active' : ''}`} style={{ borderColor: m.color }}>
              {m.name}
            </span>
          </Html>
        </group>
      ))}
    </group>
  );
}

export interface SceneState {
  mode: 'explore' | 'journey';
  selected: PartId | null;
  step: JourneyStepId;
  focus: PartId | 'overview';
  followed: Molecule['id'];
  runTime: number;
  setMz: number;
  still: boolean;
}

interface Props extends SceneState {
  onSelect: (id: PartId) => void;
  onPick: (id: Molecule['id']) => void;
}

export function InstrumentScene({ mode, selected, step, focus, followed, runTime, setMz, still, onSelect, onPick }: Props) {
  const view = mode === 'explore' ? (selected ?? 'overview') : focus;
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const narrow = aspect < 1.5 ? Math.round(aspect * 10) / 10 : 1.5;
  const goal = useMemo(() => fitToAspect(cameraFor(view), narrow), [view, narrow]);
  const mol = moleculeById(followed);
  const journey = mode === 'journey';
  const after = (s: JourneyStepId) => journey && ORDER.indexOf(step) >= ORDER.indexOf(s);
  const at = (s: JourneyStepId) => journey && step === s;

  return (
    <>
      <color attach="background" args={['#0b1220']} />
      <fog attach="fog" args={['#0b1220', 14, 30]} />
      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 6]} intensity={1.6} />
      <pointLight position={[-6, 4, 4]} intensity={25} color="#38bdf8" />
      <hemisphereLight args={['#dbeafe', '#1e293b', 0.6]} />

      <Instrument
        selected={journey ? (focus === 'overview' ? null : focus) : selected}
        onSelect={journey ? undefined : onSelect}
        showLabels={!journey}
        columnContent={
          journey && (at('separate') || at('detect')) ? (
            <ColumnBands molecules={MOLECULES} runTime={runTime} followed={followed} />
          ) : null
        }
      />

      {after('pump') && <Stream segments={['toPump', 'toInjector', 'toColumn']} count={60} color="#7dd3fc" still={still} />}
      {at('inject') && <Stream segments={['toColumn']} count={18} color={mol.color} size={0.05} speed={0.35} still={still} />}
      {(at('separate') || at('detect')) && <UvFlash intensity={signalAt(MOLECULES, runTime)} />}
      {after('ionise') && <Stream segments={['toUv', 'toSource']} count={30} color={mol.color} size={0.04} still={still} />}
      {after('ionise') && <Spray color={mol.color} still={still} />}
      {at('filter') && <QuadIons molecules={MOLECULES} setMz={setMz} still={still} />}
      {at('identify') && <QuadIons molecules={[mol]} setMz={setMz} still={still} />}
      <Picker followed={followed} onPick={onPick} hidden={!at('choose')} />

      <ContactShadows position={[0.6, 0, 0]} opacity={0.4} scale={14} blur={2.5} far={4} />
      <OrbitControls makeDefault enableDamping minDistance={2} maxDistance={24} maxPolarAngle={Math.PI * 0.49} />
      <CameraRig goal={goal} />
    </>
  );
}

const ORDER: JourneyStepId[] = ['choose', 'pump', 'inject', 'separate', 'detect', 'ionise', 'filter', 'identify'];
