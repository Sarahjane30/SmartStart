import { Edges, Html, RoundedBox } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { useMemo, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { PARTS, type PartId } from '../content/instrument';
import {
  ALL_SEGMENTS,
  DETECTOR_X,
  FRONT_Z,
  ION_Y,
  MODULE,
  MODULE_Y,
  MS,
  PART_ANCHOR,
  QUAD_END,
  QUAD_START,
  SOURCE_X,
  STACK_X,
  TRAY_Y,
  segment,
} from './layout';

const BODY = '#e8edf3';
const PANEL = '#1e293b';
const ACCENT = '#38bdf8';
const METAL = '#cbd5e1';

interface PartProps {
  id: PartId;
  active: boolean;
  onSelect?: (id: PartId) => void;
  halo: [number, number, number];
  haloAt?: [number, number, number];
  children: ReactNode;
}

function Selectable({ id, active, onSelect, halo, haloAt = [0, 0, 0], children }: PartProps) {
  const [hover, setHover] = useState(false);
  const interactive = !!onSelect;
  const on = active || (interactive && hover);
  return (
    <group
      onClick={(e: ThreeEvent<MouseEvent>) => {
        if (!onSelect) return;
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e) => {
        if (!interactive) return;
        e.stopPropagation();
        setHover(true);
        document.body.style.cursor = 'pointer';
      }}
      onPointerOut={() => {
        setHover(false);
        document.body.style.cursor = '';
      }}
    >
      {children}
      <mesh position={haloAt} visible={on}>
        <boxGeometry args={halo} />
        <meshBasicMaterial color={ACCENT} transparent opacity={active ? 0.1 : 0.05} depthWrite={false} />
        <Edges color={ACCENT} />
      </mesh>
    </group>
  );
}

function Module({ y, children }: { y: number; children?: ReactNode }) {
  return (
    <group position={[STACK_X, y, 0]}>
      <RoundedBox args={[MODULE.w, MODULE.h, MODULE.d]} radius={0.05} smoothness={3}>
        <meshStandardMaterial color={BODY} roughness={0.55} />
      </RoundedBox>
      <mesh position={[0, 0, FRONT_Z + 0.001]}>
        <planeGeometry args={[MODULE.w - 0.16, MODULE.h - 0.16]} />
        <meshStandardMaterial color={PANEL} roughness={0.4} />
      </mesh>
      <mesh position={[-MODULE.w / 2 + 0.2, -MODULE.h / 2 + 0.14, FRONT_Z + 0.005]}>
        <planeGeometry args={[0.18, 0.03]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
      {children}
    </group>
  );
}

function Bottle({ x, z, fill }: { x: number; z: number; fill: string }) {
  return (
    <group position={[x, 0.36, z]}>
      <mesh>
        <cylinderGeometry args={[0.2, 0.2, 0.6, 24]} />
        <meshPhysicalMaterial color="#dbeafe" transmission={0.85} roughness={0.08} thickness={0.2} transparent opacity={0.55} />
      </mesh>
      <mesh position={[0, -0.08, 0]}>
        <cylinderGeometry args={[0.17, 0.17, 0.4, 24]} />
        <meshStandardMaterial color={fill} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.12, 16]} />
        <meshStandardMaterial color="#0ea5e9" />
      </mesh>
    </group>
  );
}

function Tubing() {
  const geos = useMemo(() => ALL_SEGMENTS.map((s) => new THREE.TubeGeometry(segment(s), 64, 0.025, 8, false)), []);
  return (
    <>
      {geos.map((g, i) => (
        <mesh key={i} geometry={g}>
          <meshStandardMaterial color="#f59e0b" roughness={0.4} />
        </mesh>
      ))}
    </>
  );
}

function Labels({ selected, onSelect, hidden }: { selected: PartId | null; onSelect?: (id: PartId) => void; hidden: boolean }) {
  return (
    <>
      {PARTS.map((p) => {
        const [x, y, z] = PART_ANCHOR[p.id];
        const ms = p.stage === 'MS';
        const pos: [number, number, number] = ms ? [x, y + 0.75, z] : [x + MODULE.w / 2 + 0.3, y + 0.12, z];
        return (
          <Html key={p.id} position={pos} center={ms} zIndexRange={[20, 0]} style={{ display: hidden ? 'none' : undefined }}>
            <button
              type="button"
              className={`scene-label${ms ? '' : ' scene-label--side'}${selected === p.id ? ' is-active' : ''}`}
              onClick={() => onSelect?.(p.id)}
            >
              {p.name.replace(/ \(.+\)/, '')}
            </button>
          </Html>
        );
      })}
    </>
  );
}

interface Props {
  selected: PartId | null;
  onSelect?: (id: PartId) => void;
  showLabels: boolean;
  /** Rendered inside the column body, e.g. separating bands. */
  columnContent?: ReactNode;
}

export function Instrument({ selected, onSelect, showLabels, columnContent }: Props) {
  const is = (id: PartId) => selected === id;
  const colLen = 1.7;

  return (
    <group>
      <mesh position={[0.6, -0.02, 0]} receiveShadow>
        <boxGeometry args={[12.5, 0.04, 3.4]} />
        <meshStandardMaterial color="#334155" roughness={0.8} />
      </mesh>

      <Selectable id="pump" active={is('pump')} onSelect={onSelect} halo={[MODULE.w + 0.1, MODULE.h + 0.1, MODULE.d + 0.1]} haloAt={[STACK_X, MODULE_Y.pump, 0]}>
        <Module y={MODULE_Y.pump}>
          {[-0.35, 0.35].map((x) => (
            <mesh key={x} position={[x, 0.02, FRONT_Z + 0.08]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.16, 0.16, 0.16, 24]} />
              <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.25} />
            </mesh>
          ))}
        </Module>
      </Selectable>

      <Selectable id="injector" active={is('injector')} onSelect={onSelect} halo={[MODULE.w + 0.1, MODULE.h + 0.1, MODULE.d + 0.1]} haloAt={[STACK_X, MODULE_Y.injector, 0]}>
        <Module y={MODULE_Y.injector}>
          <mesh position={[-0.2, 0, FRONT_Z + 0.004]}>
            <planeGeometry args={[1.1, 0.5]} />
            <meshStandardMaterial color="#0f172a" emissive="#0c4a6e" emissiveIntensity={0.4} />
          </mesh>
          {[-0.55, -0.35, -0.15, 0.05, 0.25].map((x, i) => (
            <mesh key={x} position={[x, -0.05, FRONT_Z + 0.06]}>
              <cylinderGeometry args={[0.05, 0.05, 0.22, 12]} />
              <meshStandardMaterial color={i === 2 ? '#fbbf24' : '#e2e8f0'} transparent opacity={0.85} />
            </mesh>
          ))}
        </Module>
      </Selectable>

      <Selectable id="column" active={is('column')} onSelect={onSelect} halo={[MODULE.w + 0.1, MODULE.h + 0.1, MODULE.d + 0.3]} haloAt={[STACK_X, MODULE_Y.column, 0.1]}>
        <Module y={MODULE_Y.column}>
          <group position={[0, 0, FRONT_Z + 0.12]}>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.09, 0.09, colLen, 32, 1, true]} />
              <meshPhysicalMaterial color="#e0f2fe" transmission={0.9} roughness={0.05} transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
            <mesh rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.07, 0.07, colLen - 0.02, 24]} />
              <meshStandardMaterial color="#f1f5f9" roughness={0.9} transparent opacity={0.35} />
            </mesh>
            {[-1, 1].map((s) => (
              <mesh key={s} position={[(s * colLen) / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.12, 6]} />
                <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.2} />
              </mesh>
            ))}
          </group>
        </Module>
      </Selectable>
      {columnContent}

      <Selectable id="uv" active={is('uv')} onSelect={onSelect} halo={[MODULE.w + 0.1, MODULE.h + 0.1, MODULE.d + 0.1]} haloAt={[STACK_X, MODULE_Y.uv, 0]}>
        <Module y={MODULE_Y.uv}>
          <mesh position={[0.4, 0, FRONT_Z + 0.02]}>
            <circleGeometry args={[0.13, 24]} />
            <meshStandardMaterial color="#1e1b4b" emissive="#818cf8" emissiveIntensity={selected === 'uv' ? 1.6 : 0.5} />
          </mesh>
        </Module>
      </Selectable>

      <Selectable id="solvents" active={is('solvents')} onSelect={onSelect} halo={[MODULE.w + 0.1, 1.1, MODULE.d + 0.1]} haloAt={[STACK_X, TRAY_Y + 0.45, 0]}>
        <group position={[STACK_X, TRAY_Y, 0]}>
          <mesh>
            <boxGeometry args={[MODULE.w, 0.08, MODULE.d]} />
            <meshStandardMaterial color={BODY} />
          </mesh>
          <Bottle x={-0.75} z={0.2} fill="#bae6fd" />
          <Bottle x={-0.25} z={0.2} fill="#bae6fd" />
          <Bottle x={0.25} z={0.2} fill="#fde68a" />
          <Bottle x={0.75} z={0.2} fill="#fde68a" />
        </group>
      </Selectable>

      <Tubing />

      <group position={[MS.x, MS.y, 0]}>
        <RoundedBox args={[MS.w, 0.9, MS.d]} position={[0, -MS.h / 2 + 0.45, 0]} radius={0.06} smoothness={3}>
          <meshStandardMaterial color={BODY} roughness={0.55} />
        </RoundedBox>
        <mesh position={[0, -MS.h / 2 + 0.45, MS.d / 2 + 0.001]}>
          <planeGeometry args={[MS.w - 0.3, 0.6]} />
          <meshStandardMaterial color={PANEL} />
        </mesh>
        <mesh position={[MS.w / 2 - 0.5, -MS.h / 2 + 0.45, MS.d / 2 + 0.005]}>
          <planeGeometry args={[0.5, 0.04]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
        <mesh position={[0, 0.45, 0]}>
          <boxGeometry args={[MS.w, MS.h - 0.9, MS.d]} />
          <meshPhysicalMaterial color="#bfdbfe" transmission={0.6} roughness={0.15} transparent opacity={0.12} depthWrite={false} />
          <Edges color="#64748b" />
        </mesh>
      </group>

      <Selectable id="source" active={is('source')} onSelect={onSelect} halo={[1.1, 0.9, 1]} haloAt={[SOURCE_X - 0.15, ION_Y, 0]}>
        <group position={[SOURCE_X, ION_Y, 0]}>
          <mesh position={[-0.35, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
            <cylinderGeometry args={[0.012, 0.03, 0.4, 12]} />
            <meshStandardMaterial color={METAL} metalness={0.4} roughness={0.2} />
          </mesh>
          <mesh position={[0.25, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
            <coneGeometry args={[0.3, 0.4, 32, 1, true]} />
            <meshStandardMaterial color="#cbd5e1" metalness={0.4} roughness={0.25} side={THREE.DoubleSide} />
          </mesh>
        </group>
      </Selectable>

      <Selectable
        id="quadrupole"
        active={is('quadrupole')}
        onSelect={onSelect}
        halo={[QUAD_END - QUAD_START + 0.2, 0.75, 0.75]}
        haloAt={[(QUAD_START + QUAD_END) / 2, ION_Y, 0]}
      >
        <group position={[(QUAD_START + QUAD_END) / 2, ION_Y, 0]}>
          {[0, 1, 2, 3].map((k) => {
            const a = Math.PI / 4 + (k * Math.PI) / 2;
            return (
              <mesh key={k} position={[0, Math.sin(a) * 0.2, Math.cos(a) * 0.2]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.07, 0.07, QUAD_END - QUAD_START, 24]} />
                <meshStandardMaterial
                  color={k % 2 ? '#e2e8f0' : '#cbd5e1'}
                  metalness={0.45}
                  roughness={0.3}
                  emissive={ACCENT}
                  emissiveIntensity={selected === 'quadrupole' ? 0.25 : 0}
                />
              </mesh>
            );
          })}
        </group>
      </Selectable>

      <Selectable id="ionDetector" active={is('ionDetector')} onSelect={onSelect} halo={[0.5, 0.9, 0.9]} haloAt={[DETECTOR_X, ION_Y, 0]}>
        <group position={[DETECTOR_X, ION_Y, 0]}>
          <mesh rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.32, 0.32, 0.12, 32]} />
            <meshStandardMaterial color="#475569" metalness={0.3} roughness={0.3} />
          </mesh>
          <mesh position={[-0.07, 0, 0]} rotation={[0, -Math.PI / 2, 0]}>
            <circleGeometry args={[0.2, 32]} />
            <meshStandardMaterial color="#0f172a" emissive="#22d3ee" emissiveIntensity={selected === 'ionDetector' ? 1.4 : 0.35} />
          </mesh>
        </group>
      </Selectable>

      <Labels selected={selected} onSelect={onSelect} hidden={!showLabels || !onSelect} />
    </group>
  );
}
