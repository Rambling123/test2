import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { ShapeType, GestureType } from '../types';
import { generateShapePositions } from '../utils/shapeGenerator';

// Access global MediaPipe objects
declare const window: any;

const MAX_PARTICLES = 16000;

// Mapping for Chinese Display
const GESTURE_DISPLAY_MAP: Record<string, string> = {
  'SPHERE': '能量球体',
  'TEXT': 'Mok 文字',
  'RING': '时空圆环',
  'STAR': '闪耀星辰',
  'HEART': '爱心',
  'UNKNOWN': '等待指令...'
};

export const ARScene: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // State for UI feedback
  const [currentGesture, setCurrentGesture] = useState<GestureType>('UNKNOWN');
  const [loading, setLoading] = useState(true);
  
  // Physics Refs (Mutable for performance loop)
  const particlesRef = useRef<THREE.Points | null>(null);
  const positionsAttrRef = useRef<THREE.BufferAttribute | null>(null);
  
  // Physics State arrays (Float32 for speed)
  const targetPositionsRef = useRef<Float32Array>(new Float32Array(MAX_PARTICLES * 3));
  const velocitiesRef = useRef<Float32Array>(new Float32Array(MAX_PARTICLES * 3));
  const previousHandPosRef = useRef<THREE.Vector3 | null>(null);
  
  // Interaction Logic Refs
  const currentShapeRef = useRef<ShapeType>(ShapeType.SPHERE);
  const isInteractingRef = useRef(false);
  const handCenterRef = useRef(new THREE.Vector3(0, 0, 0));
  const sceneScaleRef = useRef(1.0);

  // Initialize Three.js
  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const width = window.innerWidth;
    const height = window.innerHeight;

    // Scene
    const scene = new THREE.Scene();
    
    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.z = 12;

    // Renderer (Alpha true for AR overlay)
    const renderer = new THREE.WebGLRenderer({ 
      canvas: canvasRef.current, 
      alpha: true, 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Particles Setup
    const geometry = new THREE.BufferGeometry();
    const posArray = generateShapePositions(ShapeType.SPHERE); // Initial shape
    targetPositionsRef.current.set(posArray); // Set initial target

    // Initialize velocity to 0
    velocitiesRef.current.fill(0);

    const positionAttribute = new THREE.BufferAttribute(new Float32Array(posArray), 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    positionsAttrRef.current = positionAttribute;

    // Material - Cyan fluid look
    const material = new THREE.PointsMaterial({
      color: 0x00FFFF,
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);
    particlesRef.current = particles;

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const delta = Math.min(clock.getDelta(), 0.1); // Cap delta
      
      updatePhysics(delta);
      
      // Apply scene scale smoothing
      if (particlesRef.current) {
        particlesRef.current.scale.lerp(new THREE.Vector3(sceneScaleRef.current, sceneScaleRef.current, sceneScaleRef.current), 0.1);
        // Look at mouse/hand roughly? No, keep it centered for now.
      }

      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
    };
  }, []);

  // Physics Engine
  const updatePhysics = (dt: number) => {
    if (!positionsAttrRef.current || !particlesRef.current) return;

    const positions = positionsAttrRef.current.array as Float32Array;
    const targets = targetPositionsRef.current;
    const velocities = velocitiesRef.current;

    // Physics Constants
    const springStrength = 3.0;
    const damping = 0.92;
    const windRadius = 4.0; 
    const windForceMult = 15.0;

    // Calculate Hand Velocity for "Wind"
    let windVel = new THREE.Vector3(0, 0, 0);
    if (isInteractingRef.current && previousHandPosRef.current) {
        const handVel = new THREE.Vector3().copy(handCenterRef.current).sub(previousHandPosRef.current).divideScalar(dt);
        // Only trigger wind if fast enough
        if (handVel.length() > 5.0) {
            windVel.copy(handVel).multiplyScalar(windForceMult);
        }
    }
    // Update prev hand pos
    previousHandPosRef.current = isInteractingRef.current ? handCenterRef.current.clone() : null;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const i3 = i * 3;
      
      // Current Pos
      let px = positions[i3];
      let py = positions[i3 + 1];
      let pz = positions[i3 + 2];

      // Target Pos
      const tx = targets[i3];
      const ty = targets[i3 + 1];
      const tz = targets[i3 + 2];

      // Acceleration (Hooke's Law: F = -k * x)
      const ax = (tx - px) * springStrength;
      const ay = (ty - py) * springStrength;
      const az = (tz - pz) * springStrength;

      // Update Velocity
      velocities[i3] += ax * dt;
      velocities[i3 + 1] += ay * dt;
      velocities[i3 + 2] += az * dt;

      // Apply Wind/Storm Interaction
      if (isInteractingRef.current && windVel.lengthSq() > 0.1) {
          // Distance from hand center (mapped to world space approx)
          // Note: handCenterRef is roughly in range -10 to 10 based on Z=12 camera
          const dx = px - handCenterRef.current.x;
          const dy = py - handCenterRef.current.y;
          const dz = pz - handCenterRef.current.z; // Particles usually z=0 centered
          
          const distSq = dx*dx + dy*dy + dz*dz;
          
          if (distSq < windRadius * windRadius) {
             // Blow away in direction of hand movement
             // Add random noise to make it look turbulent
             velocities[i3] += windVel.x * dt + (Math.random()-0.5);
             velocities[i3 + 1] += windVel.y * dt + (Math.random()-0.5);
             velocities[i3 + 2] += windVel.z * dt + (Math.random()-0.5);
          }
      }

      // Damping (Friction)
      velocities[i3] *= damping;
      velocities[i3 + 1] *= damping;
      velocities[i3 + 2] *= damping;

      // Update Position
      positions[i3] += velocities[i3] * dt;
      positions[i3 + 1] += velocities[i3 + 1] * dt;
      positions[i3 + 2] += velocities[i3 + 2] * dt;
    }

    positionsAttrRef.current.needsUpdate = true;
  };

  // Trigger Shape Morph with Explosion
  const morphTo = useCallback((type: ShapeType) => {
    if (currentShapeRef.current === type) return;
    
    currentShapeRef.current = type;
    const newPositions = generateShapePositions(type);
    
    // Update targets
    targetPositionsRef.current.set(newPositions);

    // Create Explosion Effect: Add radial velocity outward from center
    const velocities = velocitiesRef.current;
    const positions = positionsAttrRef.current?.array as Float32Array;

    if (positions) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const i3 = i * 3;
        // Random explosive vector
        const ex = (Math.random() - 0.5) * 20;
        const ey = (Math.random() - 0.5) * 20;
        const ez = (Math.random() - 0.5) * 20;
        
        velocities[i3] += ex;
        velocities[i3+1] += ey;
        velocities[i3+2] += ez;
      }
    }

  }, []);

  // MediaPipe Setup
  useEffect(() => {
    if (!videoRef.current) return;

    const setupCamera = async () => {
      if (!window.Hands || !window.Camera) {
        console.warn("MediaPipe not loaded yet, retrying...");
        setTimeout(setupCamera, 500);
        return;
      }

      const hands = new window.Hands({
        locateFile: (file: string) => {
          return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
      });

      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
      });

      hands.onResults(onResults);

      const camera = new window.Camera(videoRef.current, {
        onFrame: async () => {
          if(videoRef.current) await hands.send({ image: videoRef.current });
        },
        width: 1280,
        height: 720
      });

      camera.start();
      setLoading(false);
    };

    setupCamera();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gesture Recognition Logic
  const onResults = (results: any) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      isInteractingRef.current = true;
      
      // 1. Calculate Hand Center (Screen space mapped to World space roughly)
      // Camera Z is 12. At Z=0, Height is ~ 2*12*tan(FOV/2). 
      // Approximate visible range at Z=0 is approx -10 to 10 depending on aspect.
      const aspect = window.innerWidth / window.innerHeight;
      const visibleHeight = 2 * Math.tan((75 * Math.PI / 180) / 2) * 12;
      const visibleWidth = visibleHeight * aspect;

      // Wrist is index 0, Middle Finger MCP is 9
      const cx = (0.5 - landmarks[9].x) * visibleWidth; // Mirror X
      const cy = (0.5 - landmarks[9].y) * visibleHeight;
      handCenterRef.current.set(cx, cy, 0);

      // 2. Depth / Scale Interaction
      // Use bounding box area or palm size to estimate z-push
      // Simple approximation: distance between wrist (0) and middle finger tip (12)
      const dy = landmarks[0].y - landmarks[12].y;
      const dx = landmarks[0].x - landmarks[12].x;
      const dist = Math.sqrt(dx*dx + dy*dy);
      // Base distance usually around 0.3-0.5 depending on distance
      // Map 0.2 (far) -> 0.5 scale, 0.6 (close) -> 2.0 scale
      const targetScale = Math.max(0.5, Math.min(2.5, dist * 4)); 
      sceneScaleRef.current = targetScale;

      // 3. Gesture Classification
      const gesture = detectGesture(landmarks);
      setCurrentGesture(gesture);
      
      if (gesture !== 'UNKNOWN') {
        morphTo(gesture as ShapeType);
      }

    } else {
      isInteractingRef.current = false;
    }
  };

  const detectGesture = (lm: any[]): GestureType => {
    // MediaPipe Landmarks: 0=Wrist, 4=ThumbTip, 8=IndexTip, 12=MiddleTip, 16=RingTip, 20=PinkyTip
    
    // Helper: is finger extended? (Tip y < PIP y is not enough due to rotation, use vector distance to wrist)
    const isExtended = (tipIdx: number, pipIdx: number) => {
      // Simple check: distance from wrist to tip > distance from wrist to PIP (Proximal Interphalangeal joint)
      // Actually simpler: compare distance from wrist.
      // 0 is wrist.
      const dTip = dist(lm[0], lm[tipIdx]);
      const dPip = dist(lm[0], lm[pipIdx]);
      return dTip > dPip * 1.2; // significant extension
    };

    const thumbOpen = isExtended(4, 2); // 2 is CMC
    const indexOpen = isExtended(8, 6);
    const middleOpen = isExtended(12, 10);
    const ringOpen = isExtended(16, 14);
    const pinkyOpen = isExtended(20, 18);

    // 1. Fist (Ring) -> All closed
    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
      return ShapeType.RING;
    }

    // 2. Open Hand (Sphere) -> All open
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) { // Thumb is tricky, ignore for robustness
      return ShapeType.SPHERE;
    }

    // 3. Scissors/Victory (Text: "我是 Mok") -> Index & Middle open, others closed
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
      return ShapeType.TEXT;
    }

    // 4. Index (Star) -> Index open only
    if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
      return ShapeType.STAR;
    }

    // 5. Thumbs Up (Heart) -> Thumb open, others closed (roughly)
    // Often when doing thumbs up, fingers are curled but not fully tight. 
    // Let's check if thumb tip is significantly higher (lower Y value) than other knuckles
    if (thumbOpen && !indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
       return ShapeType.HEART;
    }
    
    return 'UNKNOWN';
  };

  const dist = (p1: any, p2: any) => {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2));
  };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden bg-black">
      {/* Hidden Video for CV */}
      <video
        ref={videoRef}
        className="absolute top-0 left-0 w-full h-full object-cover opacity-0 pointer-events-none"
        playsInline
      />
      
      {/* Visible Camera Feed */}
      <video
        ref={(el) => {
          // Double ref assignment hack to use same element for source and display
          // Actually, we can just remove opacity-0 but keep transform.
          if (videoRef.current !== el) {
             // @ts-ignore
             videoRef.current = el;
          }
        }}
        className="absolute top-0 left-0 w-full h-full object-cover"
        style={{ transform: 'scaleX(-1)' }}
        playsInline
        muted
      />

      {/* AR Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      />

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none text-cyan-400 font-mono">
        <h1 className="text-2xl font-bold mb-2 drop-shadow-md">Mok AR 粒子</h1>
        {loading ? (
          <div className="animate-pulse">模型加载中...</div>
        ) : (
          <div className="flex flex-col gap-1 bg-black/50 p-4 rounded-lg backdrop-blur-sm border border-cyan-500/30">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-500 animate-ping"/>
              <span>视觉追踪已激活</span>
            </div>
            <div className="mt-2 text-sm text-gray-300">
              <p>当前手势： <span className="text-white font-bold">{GESTURE_DISPLAY_MAP[currentGesture] || currentGesture}</span></p>
              <p className="text-xs text-gray-500 mt-1">
                🖐 球体 | ✌️ 文字 | ✊ 圆环<br/>
                ☝️ 星形 | 👍 爱心
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Instructions Overlay (Fades out) */}
      {!loading && (
        <div className="absolute bottom-10 w-full text-center z-20 pointer-events-none animate-[fadeOut_5s_ease-in-out_forwards]">
            <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
                快速挥动产生气流 • 前后移动缩放大小
            </span>
        </div>
      )}
    </div>
  );
};