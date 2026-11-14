export type ScenePosition = { x: number; y: number; z: number };
export type Mounting = 'tree' | 'floor';

export const MIN_SCALE = .5;
export const MAX_SCALE = 2;

export const accessorySizes: Record<string, [height: number, depth: number, width: number]> = {
  wheel: [.98, .18, .78], lantern: [.74, .26, .36], nutcracker: [.87, .22, .25],
  'polar-bear': [.58, .34, .58], deer: [.74, .29, .37], girl: [.74, .24, .27],
  jester: [.75, .26, .33], santa: [.79, .30, .37], 'bear-dress': [.64, .33, .34],
  'bear-trousers': [.64, .33, .34], bell: [.26, .40, .23], bauble: [.235, .76, .20],
  stocking: [.36, .19, .20], star: [.32, .13, .24],
};

export const accessorySize = (kind: string) => accessorySizes[kind] ?? [.55, .22, .28];

export interface Occupant {
  mounting: Mounting;
  position3d: ScenePosition;
  scale: number;
  rotation: number;
  kind: string;
}

export function isOnPlacementSurface(position: ScenePosition, mounting: Mounting) {
  const { x, y, z } = position;
  if (![x, y, z].every(Number.isFinite)) return false;
  const radius = Math.hypot(x, z);
  if (mounting === 'floor') return y >= 0 && y <= .1 && radius >= .65 && radius <= 3.7;
  const surfaceRadius = .78 * (3.32 - y) / 2.7;
  const offset = radius - surfaceRadius;
  return y >= .7 && y <= 3.28 && offset >= -.015 && offset <= .10;
}

function footprint(item: Occupant) {
  const [height, , width] = accessorySize(item.kind);
  const h = height * item.scale, w = width * item.scale;
  const angle = item.rotation * Math.PI / 180;
  const cosine = Math.cos(angle), sine = Math.sin(angle);
  const azimuth = Math.atan2(item.position3d.x, item.position3d.z);
  return {
    width: item.mounting === 'floor' ? w : Math.abs(w * cosine) + Math.abs(h * sine),
    height: item.mounting === 'floor' ? h : Math.abs(h * cosine) + Math.abs(w * sine),
    center: item.mounting === 'floor' ? item.position3d : {
      x: item.position3d.x + Math.cos(azimuth) * sine * h / 2,
      y: item.position3d.y - cosine * h / 2,
      z: item.position3d.z - Math.sin(azimuth) * sine * h / 2,
    },
  };
}

export function accessoryFitsSurface(item: Occupant) {
  if (!isOnPlacementSurface(item.position3d, item.mounting)) return false;
  const area = footprint(item);
  const radius = Math.hypot(area.center.x, area.center.z);
  if (item.mounting === 'floor') return radius >= .48 + area.width / 2 && radius + area.width / 2 <= 3.7;
  const availableRadius = .78 * (3.32 - area.center.y) / 2.7;
  return area.center.y - area.height / 2 >= .66 && area.center.y + area.height / 2 <= 3.29 &&
    area.width / 2 <= availableRadius * .95;
}

export function accessoryOverlap(a: Occupant, b: Occupant) {
  if (a.mounting !== b.mounting) return false;
  const anchorGap = Math.hypot(a.position3d.x - b.position3d.x, a.position3d.z - b.position3d.z);
  if (anchorGap < .055 && Math.abs(a.position3d.y - b.position3d.y) < .055) return true;
  const areaA = footprint(a), areaB = footprint(b);
  const gap = Math.hypot(areaA.center.x - areaB.center.x, areaA.center.z - areaB.center.z);
  const combinedWidth = (areaA.width + areaB.width) / 2;
  if (a.mounting === 'floor') return gap < combinedWidth * .80 + .045;
  const overlapHeight = Math.min(areaA.center.y + areaA.height / 2, areaB.center.y + areaB.height / 2) -
    Math.max(areaA.center.y - areaA.height / 2, areaB.center.y - areaB.height / 2);
  return overlapHeight > Math.min(areaA.height, areaB.height) * .27 && gap < combinedWidth * .78 + .017;
}
