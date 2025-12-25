export enum ShapeType {
  SPHERE = 'SPHERE',
  TEXT = 'TEXT',
  RING = 'RING',
  STAR = 'STAR',
  HEART = 'HEART',
}

export interface ParticleState {
  currentPosition: Float32Array; // x, y, z
  targetPosition: Float32Array; // x, y, z
  velocity: Float32Array; // vx, vy, vz
}

export interface HandData {
  landmarks: { x: number; y: number; z: number }[];
  worldLandmarks: { x: number; y: number; z: number }[];
}

export type GestureType = ShapeType | 'UNKNOWN';

// Global augmentation
declare global {
  interface Window {
    Hands: any;
    Camera: any;
    drawConnectors: any;
    drawLandmarks: any;
    HAND_CONNECTIONS: any;
  }
}