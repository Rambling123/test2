import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Refs
  const handsRef = useRef<any>(null);
  const requestRef = useRef<number | null>(null);
  const isComponentMounted = useRef(true);

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
    isComponentMounted.current = true;
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
      isComponentMounted.current = false;
      cancelAnimationFrame(animationFrameId);
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      
      // Stop camera stream
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
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
          const dx = px - handCenterRef.current.x;
          const dy = py - handCenterRef.current.y;
          const dz = pz - handCenterRef.current.z; 
          
          const distSq = dx*dx + dy*dy + dz*dz;
          
          if (distSq < windRadius * windRadius) {
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

    // Create Explosion Effect
    const velocities = velocitiesRef.current;
    const positions = positionsAttrRef.current?.array as Float32Array;

    if (positions) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const i3 = i * 3;
        const ex = (Math.random() - 0.5) * 20;
        const ey = (Math.random() - 0.5) * 20;
        const ez = (Math.random() - 0.5) * 20;
        
        velocities[i3] += ex;
        velocities[i3+1] += ey;
        velocities[i3+2] += ez;
      }
    }

  }, []);

  // MediaPipe & Camera Setup
  useEffect(() => {
    if (!videoRef.current) return;

    const setupMediaPipe = async () => {
      try {
        if (!window.Hands) {
          console.warn("MediaPipe not loaded yet, retrying...");
          setTimeout(setupMediaPipe, 500);
          return;
        }

        // 1. Setup Hands
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
        handsRef.current = hands;

        // 2. Setup Camera manually (More robust than Camera Utils)
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            
            setLoading(false);
            processVideo();
        }
        
      } catch (err: any) {
        console.error("Initialization Error:", err);
        setErrorMsg("无法访问摄像头，请检查权限。");
        setLoading(false);
      }
    };

    const processVideo = async () => {
        if (!isComponentMounted.current) return;
        
        if (videoRef.current && handsRef.current) {
            await handsRef.current.send({ image: videoRef.current });
        }
        requestRef.current = requestAnimationFrame(processVideo);
    };

    setupMediaPipe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Gesture Recognition Logic
  const onResults = (results: any) => {
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
      const landmarks = results.multiHandLandmarks[0];
      
      isInteractingRef.current = true;
      
      // Calculate Hand Center (Screen space mapped to World space roughly)
      const aspect = window.innerWidth / window.innerHeight;
      const visibleHeight = 2 * Math.tan((75 * Math.PI / 180) / 2) * 12;
      const visibleWidth = visibleHeight * aspect;

      // Wrist is index 0, Middle Finger MCP is 9
      const cx = (0.5 - landmarks[9].x) * visibleWidth; // Mirror X
      const cy = (0.5 - landmarks[9].y) * visibleHeight;
      handCenterRef.current.set(cx, cy, 0);

      // Depth / Scale Interaction
      const dy = landmarks[0].y - landmarks[12].y;
      const dx = landmarks[0].x - landmarks[12].x;
      const distVal = Math.sqrt(dx*dx + dy*dy);
      const targetScale = Math.max(0.5, Math.min(2.5, distVal * 4)); 
      sceneScaleRef.current = targetScale;

      // Gesture Classification
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
    // Helper: is finger extended?
    const isExtended = (tipIdx: number, pipIdx: number) => {
      const dTip = dist(lm[0], lm[tipIdx]);
      const dPip = dist(lm[0], lm[pipIdx]);
      return dTip > dPip * 1.2;
    };

    const thumbOpen = isExtended(4, 2);
    const indexOpen = isExtended(8, 6);
    const middleOpen = isExtended(12, 10);
    const ringOpen = isExtended(16, 14);
    const pinkyOpen = isExtended(20, 18);

    if (!indexOpen && !middleOpen && !ringOpen && !pinkyOpen && !thumbOpen) {
      return ShapeType.RING;
    }
    if (indexOpen && middleOpen && ringOpen && pinkyOpen) { 
      return ShapeType.SPHERE;
    }
    if (indexOpen && middleOpen && !ringOpen && !pinkyOpen) {
      return ShapeType.TEXT;
    }
    if (indexOpen && !middleOpen && !ringOpen && !pinkyOpen) {
      return ShapeType.STAR;
    }
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
      
      {/* AR Overlay Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"
      />

      {/* UI Overlay */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none text-cyan-400 font-mono">
        <h1 className="text-2xl font-bold mb-2 drop-shadow-md">Mok AR 粒子</h1>
        {loading ? (
          <div className="animate-pulse">{errorMsg || "系统初始化中..."}</div>
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
      
      {!loading && !errorMsg && (
        <div className="absolute bottom-10 w-full text-center z-20 pointer-events-none animate-[fadeOut_5s_ease-in-out_forwards]">
            <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
                快速挥动产生气流 • 前后移动缩放大小
            </span>
        </div>
      )}
    </div>
  );
};