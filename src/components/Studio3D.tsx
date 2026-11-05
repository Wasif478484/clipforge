import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Float, MeshDistortMaterial, Stars, Environment } from '@react-three/drei';
import * as THREE from 'three';

function FloatingShape({ position, color, speed = 1, scale = 1 }: { position: [number, number, number]; color: string; speed?: number; scale?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.15 * speed;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2 * speed;
    }
  });
  return (
    <Float speed={1.2 * speed} rotationIntensity={0.3} floatIntensity={0.8}>
      <mesh ref={meshRef} position={position} scale={scale}>
        <icosahedronGeometry args={[1, 1]} />
        <MeshDistortMaterial color={color} distort={0.25} speed={1.5} roughness={0.3} metalness={0.7} />
      </mesh>
    </Float>
  );
}

function ParticleField() {
  const count = 800;
  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
    }
    return pos;
  }, []);
  const pointsRef = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y = state.clock.elapsedTime * 0.03;
    }
  });
  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.04} color="#a0a0b8" transparent opacity={0.4} sizeAttenuation />
    </points>
  );
}

export function Studio3DScene() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} color="#ffffff" />
      <directionalLight position={[-3, -3, -3]} intensity={0.3} color="#ef4b9a" />
      <ParticleField />
      <FloatingShape position={[-3, 1, -2]} color="#ef4b9a" speed={1} scale={1.1} />
      <FloatingShape position={[3, -1, -1]} color="#3b82f6" speed={0.7} scale={0.8} />
      <FloatingShape position={[0, 0, -3]} color="#f6cc8b" speed={1.1} scale={1.3} />
      <FloatingShape position={[-1.5, -2, 1]} color="#a855f7" speed={0.5} scale={0.6} />
      <FloatingShape position={[2, 2, 1]} color="#22c55e" speed={0.9} scale={0.7} />
      <Stars radius={40} depth={40} count={1000} factor={3} saturation={0} fade speed={0.5} />
      <Environment preset="night" />
    </>
  );
}

export function Studio3DHero() {
  return (
    <div className="studio-3d-hero" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 8], fov: 45 }} dpr={[1, 2]}>
        <Studio3DScene />
      </Canvas>
    </div>
  );
}
