import { ShapeType } from '../types';
import * as THREE from 'three';

const PARTICLE_COUNT = 16000;
const RADIUS = 4;

// Helper to get random point in sphere
const randomOnSphere = (r: number) => {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  const x = r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.sin(phi) * Math.sin(theta);
  const z = r * Math.cos(phi);
  return new THREE.Vector3(x, y, z);
};

export const generateShapePositions = (type: ShapeType): Float32Array => {
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  const tempVec = new THREE.Vector3();

  if (type === ShapeType.TEXT) {
    return generateTextParticles("我是 Mok");
  }

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    let x = 0, y = 0, z = 0;

    switch (type) {
      case ShapeType.SPHERE: {
        const p = randomOnSphere(RADIUS);
        x = p.x; y = p.y; z = p.z;
        break;
      }
      case ShapeType.RING: {
        // Torus knot-ish or simple ring
        const u = Math.random() * Math.PI * 2;
        const tubeRadius = 1.2;
        const ringRadius = 3.5;
        // Simple Torus
        const v = Math.random() * Math.PI * 2;
        x = (ringRadius + tubeRadius * Math.cos(v)) * Math.cos(u);
        y = (ringRadius + tubeRadius * Math.cos(v)) * Math.sin(u);
        z = tubeRadius * Math.sin(v);
        
        // Add some noise so it looks fluid
        x += (Math.random() - 0.5) * 0.2;
        y += (Math.random() - 0.5) * 0.2;
        z += (Math.random() - 0.5) * 0.2;
        break;
      }
      case ShapeType.STAR: {
        // 3D Star shape
        const u = Math.random() * Math.PI * 2;
        const v = Math.random() * Math.PI;
        const rBase = 3.5;
        // Perturb radius based on angle to create spikes
        const spikes = 5;
        const spikeAmp = 1.5;
        // A simple math trick for 3D star-like distribution
        const r = rBase + Math.pow(Math.sin(u * spikes) * Math.sin(v * spikes), 2) * spikeAmp;
        
        x = r * Math.sin(v) * Math.cos(u);
        y = r * Math.sin(v) * Math.sin(u);
        z = r * Math.cos(v);
        break;
      }
      case ShapeType.HEART: {
        // 3D Heart formula
        const scale = 0.25; 
        
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.random() * Math.PI;
        
        // Heart formula approx
        x = scale * 16 * Math.pow(Math.sin(phi), 3) * Math.cos(theta);
        z = scale * 16 * Math.pow(Math.sin(phi), 3) * Math.sin(theta);
        y = scale * (13 * Math.cos(phi) - 5 * Math.cos(2*phi) - 2 * Math.cos(3*phi) - Math.cos(4*phi));
        
        // Rotate upright
        const oldY = y;
        y = z;
        z = oldY;
        
        // Adjust orientation
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1,0,0), -Math.PI/2);
        tempVec.set(x,y,z).applyQuaternion(q);
        x = tempVec.x; y = tempVec.y; z = tempVec.z;

        break;
      }
    }

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }

  return positions;
};

// Generate text particles using an off-screen canvas
function generateTextParticles(text: string): Float32Array {
  const canvas = document.createElement('canvas');
  const size = 256;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) return new Float32Array(PARTICLE_COUNT * 3);

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 60px "Microsoft YaHei", sans-serif'; // Support Chinese
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, size / 2, size / 2);

  const imageData = ctx.getImageData(0, 0, size, size);
  const data = imageData.data;
  
  const validPoints: number[] = [];

  // Scan pixel data
  for (let y = 0; y < size; y += 2) {
    for (let x = 0; x < size; x += 2) {
      const index = (y * size + x) * 4;
      // If pixel is bright (white text)
      if (data[index] > 128) {
        // Map 0..256 to -4..4 range
        const px = (x / size - 0.5) * 10;
        const py = -(y / size - 0.5) * 10; // Flip Y
        validPoints.push(px, py, 0);
      }
    }
  }

  const positions = new Float32Array(PARTICLE_COUNT * 3);
  
  // Fill particle array, repeating points if necessary to match PARTICLE_COUNT
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const srcIndex = i % (validPoints.length / 3);
    // Add z-jitter for 3D volume effect
    const zJitter = (Math.random() - 0.5) * 1.0; 
    
    positions[i * 3] = validPoints[srcIndex * 3];
    positions[i * 3 + 1] = validPoints[srcIndex * 3 + 1];
    positions[i * 3 + 2] = validPoints[srcIndex * 3 + 2] + zJitter;
  }

  return positions;
}