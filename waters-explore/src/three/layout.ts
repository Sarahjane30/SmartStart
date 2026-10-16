import * as THREE from 'three';
import type { PartId } from '../content/instrument';

type V3 = [number, number, number];

/**
 * LC stack on the left (bottom to top: pump, sample manager, column manager, detector,
 * solvent tray), mass spectrometer on the right. Module fronts face +z at z = 0.8.
 */
export const STACK_X = -3;
export const MODULE = { w: 2.4, h: 0.82, d: 1.6 };
export const FRONT_Z = MODULE.d / 2;

export const MODULE_Y: Record<'pump' | 'injector' | 'column' | 'uv', number> = {
  pump: 0.45,
  injector: 1.33,
  column: 2.21,
  uv: 3.09,
};
export const TRAY_Y = 3.62;

export const MS = { x: 2.6, y: 1.05, w: 5.2, h: 2.1, d: 2 };
export const ION_Y = 1.75;
export const SOURCE_X = 0.55;
export const QUAD_START = 1.7;
export const QUAD_END = 3.9;
export const DETECTOR_X = 4.55;

export const COLUMN_START: V3 = [STACK_X - 0.85, MODULE_Y.column, FRONT_Z + 0.12];
export const COLUMN_END: V3 = [STACK_X + 0.85, MODULE_Y.column, FRONT_Z + 0.12];

export const PART_ANCHOR: Record<PartId, V3> = {
  solvents: [STACK_X, TRAY_Y + 0.45, 0],
  pump: [STACK_X, MODULE_Y.pump, FRONT_Z],
  injector: [STACK_X, MODULE_Y.injector, FRONT_Z],
  column: [STACK_X, MODULE_Y.column, FRONT_Z],
  uv: [STACK_X, MODULE_Y.uv, FRONT_Z],
  source: [SOURCE_X, ION_Y, 0],
  quadrupole: [(QUAD_START + QUAD_END) / 2, ION_Y, 0],
  ionDetector: [DETECTOR_X, ION_Y, 0],
};

export interface CameraGoal {
  position: V3;
  target: V3;
}

export const OVERVIEW: CameraGoal = { position: [0.6, 4, 11.5], target: [0.5, 1.8, 0] };

/** Pull the camera back on narrow viewports so the same framing still fits. */
export const fitToAspect = (goal: CameraGoal, aspect: number): CameraGoal => {
  const k = Math.max(1, 1.3 / aspect);
  const [tx, ty, tz] = goal.target;
  const [px, py, pz] = goal.position;
  return { target: goal.target, position: [tx + (px - tx) * k, ty + (py - ty) * k, tz + (pz - tz) * k] };
};

export const cameraFor = (id: PartId | 'overview'): CameraGoal => {
  if (id === 'overview') return OVERVIEW;
  const [x, y, z] = PART_ANCHOR[id];
  const ms = id === 'source' || id === 'quadrupole' || id === 'ionDetector';
  return ms
    ? { position: [x - 0.6, y + 1.6, z + 4.6], target: [x - 0.3, y - 0.1, z] }
    : { position: [x + 1.8, y + 1.0, z + 4.2], target: [x, y, z] };
};

const T = FRONT_Z + 0.06;
const L = STACK_X - MODULE.w / 2 - 0.15;
const R = STACK_X + MODULE.w / 2 + 0.15;

export type SegmentId = 'toPump' | 'toInjector' | 'toColumn' | 'column' | 'toUv' | 'toSource';

const WAYPOINTS: Record<SegmentId, V3[]> = {
  toPump: [
    [STACK_X - 0.6, TRAY_Y + 0.1, 0.2],
    [L, TRAY_Y - 0.1, T],
    [L, MODULE_Y.pump + 0.2, T],
    [STACK_X - 0.5, MODULE_Y.pump, T],
  ],
  toInjector: [
    [STACK_X - 0.5, MODULE_Y.pump, T],
    [STACK_X + 0.6, MODULE_Y.pump, T],
    [R, MODULE_Y.pump + 0.4, T],
    [R, MODULE_Y.injector - 0.1, T],
    [STACK_X + 0.5, MODULE_Y.injector, T],
  ],
  toColumn: [
    [STACK_X + 0.5, MODULE_Y.injector, T],
    [STACK_X - 0.6, MODULE_Y.injector, T],
    [L, MODULE_Y.injector + 0.4, T],
    [L + 0.1, MODULE_Y.column, COLUMN_START[2]],
    COLUMN_START,
  ],
  column: [COLUMN_START, COLUMN_END],
  toUv: [
    COLUMN_END,
    [R, MODULE_Y.column + 0.1, T],
    [R, MODULE_Y.uv - 0.2, T],
    [STACK_X + 0.4, MODULE_Y.uv, T],
  ],
  toSource: [
    [STACK_X + 0.4, MODULE_Y.uv, T],
    [R + 0.2, MODULE_Y.uv, T],
    [R + 0.9, MODULE_Y.uv - 0.4, 0.4],
    [SOURCE_X - 0.9, ION_Y + 0.6, 0],
    [SOURCE_X - 0.3, ION_Y, 0],
  ],
};

const curves = new Map<SegmentId, THREE.Curve<THREE.Vector3>>();

export const segment = (id: SegmentId): THREE.Curve<THREE.Vector3> => {
  let c = curves.get(id);
  if (!c) {
    const pts = WAYPOINTS[id].map((p) => new THREE.Vector3(...p));
    c = pts.length === 2 ? new THREE.LineCurve3(pts[0], pts[1]) : new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.2);
    curves.set(id, c);
  }
  return c;
};

export const ALL_SEGMENTS: SegmentId[] = ['toPump', 'toInjector', 'toColumn', 'toUv', 'toSource'];
