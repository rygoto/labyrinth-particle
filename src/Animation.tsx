import React, { useRef, useState, Suspense, useMemo, useEffect, useCallback } from "react";
import { Canvas, useThree, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom, Noise } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { AnimationMixer, Mesh, BufferGeometry, Material, Vector3, Points, Group } from "three";
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { Stats, OrbitControls, useGLTF, useAnimations, Html } from "@react-three/drei";

function getGeometryPosition(geometry: THREE.BufferGeometry): Float32Array {
    const numParticles = 20000;
    const sampler = new MeshSurfaceSampler(new THREE.Mesh(geometry)).build();
    const particlesPosition = new Float32Array(numParticles * 3);
    for (let i = 0; i < numParticles; i++) {
        const newPosition = new THREE.Vector3();
        sampler.sample(newPosition);
        particlesPosition.set([newPosition.x, newPosition.y, newPosition.z], i * 3);
    }
    return particlesPosition;
}

interface CustomMeshProps {
    startAnimation: boolean;
    morphDirection: 'forward' | 'backward';
    isWalking: boolean;
}

//const CustomMesh = ({ startAnimation, morphDirection, isWalking }) => {
const CustomMesh: React.FC<CustomMeshProps> = ({ startAnimation, morphDirection, isWalking }) => {
    const { scene } = useThree();
    const groupRef = useRef<Group>(null);
    const [mixValue, setMixValue] = useState<number>(0.0);
    const materialRef = useRef<THREE.RawShaderMaterial | null>(null);
    const positionRef = useRef<number>(0);
    const previouslyWalkingRef = useRef<boolean>(false);
    const maze1model = useGLTF('/maze1.glb');
    const maze2model = useGLTF('/maze2.glb');

    useEffect(() => {
        const geometries: THREE.BufferGeometry[] = [];

        maze1model.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
                geometries.push(child.geometry);
            }
        });

        maze2model.scene.traverse((child) => {
            if (child instanceof THREE.Mesh && child.geometry instanceof THREE.BufferGeometry) {
                geometries.push(child.geometry);
            }
        });

        const geometry = new THREE.BufferGeometry();
        geometries.forEach((geom, index) => {
            const pos = getGeometryPosition(geom);
            geometry.setAttribute(`position${index ? index + 1 : ''}`, new THREE.BufferAttribute(pos, 3));
        });

        Object.keys(geometry.attributes).forEach(attrName => {
            console.log(attrName);
        });
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const material = new THREE.RawShaderMaterial({
            uniforms: {
                mixValue: { value: mixValue },
                time: { value: 0 }
            },
            vertexShader: isMobile ? vertexshader : vertexshader,
            fragmentShader: isMobile ? fragmentshader : fragmentshader,
            transparent: true,
            blending: THREE.AdditiveBlending
        });
        materialRef.current = material;

        const mesh = new THREE.Points(geometry, material);
        if (groupRef.current) {
            groupRef.current.add(mesh);
        }

        return () => {
            if (groupRef.current) {
                groupRef.current.remove(mesh);
            }
        };
    }, []);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.time.value = state.clock.elapsedTime;
        }
        if (isWalking) {
            const speed = 0.015;
            const maxZ = 47;

            positionRef.current += speed;

            if (positionRef.current > maxZ) {
                // maxZを超えたら即座に0に戻す
                positionRef.current = 0;
            }

            if (groupRef.current) {
                groupRef.current.position.z = positionRef.current;
            }
            previouslyWalkingRef.current = true;
        } else if (previouslyWalkingRef.current) {
            previouslyWalkingRef.current = false;
        }
    });

    useFrame(() => {
        if (startAnimation) {
            setMixValue((prevValue) => {
                if (morphDirection === 'forward') {
                    return prevValue >= 1 ? 1 : prevValue + 0.02;
                } else {
                    return prevValue <= 0 ? 0 : prevValue - 0.02;
                }
            });
            if (materialRef.current) {
                materialRef.current.uniforms.mixValue.value = mixValue;
            }
        }
    });

    return (
        <group ref={groupRef} />
    );
};

const vertexshader = `
attribute vec3 position;
attribute vec3 position2;
attribute vec3 position3;
attribute vec3 secPosition;
attribute vec3 secposition;
uniform float mixValue;
uniform float time;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

varying float vBrightness;

void main() {
    vec3 mixed = mix(position, position2, mixValue);
    vec4 mvPosition = modelViewMatrix * vec4(mixed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // パーティクルサイズの変動
    float size = sin(time * 2.0 + gl_Position.x * 100.0) * 0.5 * 3.0 + 1.5;
    gl_PointSize = size * (300.0 / -mvPosition.z) / 60.0;
    
    // 明るさの変動（キラキラ効果用）
    vBrightness = sin(time * 3.0 + gl_Position.y * 10.0) * 0.5 * 2.0 + 0.5;
}
`;

const fragmentshader = `
precision mediump float;
varying float vBrightness;

void main() {
    vec2 temp = gl_PointCoord - vec2(0.5);
    float f = dot(temp, temp);
    if (f > 0.25) {
        discard;
    }
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0) * vBrightness;
}
`;

const vertexshader2 = `
attribute vec3 position;
attribute vec3 position2;
uniform float mixValue;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

void main() {
    vec3 morphed = mix(position, position2, mixValue);
    vec4 mvPosition = modelViewMatrix * vec4(morphed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // 固定サイズのポイント
    gl_PointSize = 2.0;
}
`;

const fragmentshader2 = `
precision mediump float;

void main() {
    // シンプルな円形のポイント
    vec2 center = gl_PointCoord - vec2(0.5);
    float dist = length(center);
    if (dist > 0.5) {
        discard;
    }
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
}
`;

interface AnimationsProps {
    isWalking: boolean;
    isJumping: boolean;
}

function Animations({ isWalking, isJumping }: AnimationsProps) {
    const ref = useRef<Group>(null);
    const { nodes, materials } = useGLTF('/eve.glb');
    const idleAnimation = useGLTF('/animations/idle.glb').animations;
    const walkAnimation = useGLTF('/animations/eve@walking.glb').animations;
    const jumpAnimation = useGLTF('/animations/eve@jump.glb').animations;
    const actions = useRef<{ [key: string]: THREE.AnimationAction }>({});
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const [action, setAction] = useState<THREE.AnimationAction | null>(null);
    const [wait, setWait] = useState<boolean>(false);
    let actionAssigned: boolean;

    useEffect(() => {
        if (ref.current) {
            mixerRef.current = new THREE.AnimationMixer(ref.current);

            actions.current['idle'] = mixerRef.current.clipAction(idleAnimation[0]);
            actions.current['walk'] = mixerRef.current.clipAction(walkAnimation[0]);
            actions.current['jump'] = mixerRef.current.clipAction(jumpAnimation[0]);
            actions.current['idle'].play();
        }
    }, [idleAnimation, walkAnimation, jumpAnimation]);

    useEffect(() => {
        action?.reset().fadeIn(0.5).play();
        return () => {
            action?.fadeOut(0.5);
        }
    }, [action]);

    useFrame((_, delta) => {
        if (mixerRef.current) {
            if (!wait) {
                actionAssigned = false;
                if (isWalking) {
                    setAction(actions.current['walk'])
                    actionAssigned = true
                }

                if (isJumping) {
                    setAction(actions.current['jump'])
                    actionAssigned = true
                    setWait(true) // wait for jump to finish
                    setTimeout(() => setWait(false), 1000)
                }

                if (!actionAssigned) {
                    setAction(actions.current['idle'])
                }
            }
            mixerRef.current.update(delta);
        }
    })


    return (
        <group ref={ref} dispose={null}>
            <group name="Scene">
                <group name="Armature" rotation={[Math.PI / 2, 0, Math.PI]} scale={0.01} position={[0, 0, -1.2]}>
                    <primitive object={nodes.mixamorigHips} />
                    <skinnedMesh castShadow name="Mesh" frustumCulled={false} geometry={nodes.Mesh.geometry} material={materials.SpacePirate_M} skeleton={nodes.Mesh.skeleton} />
                </group>
            </group>
        </group>
    )
}

useGLTF.preload(['/eve.glb', '/animations/idle.glb', '/animations/eve@walking.glb', '/animations/eve@jump.glb', '/maze1.glb']);

function Loader() {
    return <div className="loader"></div>
}

function Animation() {
    const [isWalking, setIsWalking] = useState<boolean>(false);
    const [isJumping, setIsJumping] = useState<boolean>(false);
    const [startAnimation, setStartAnimation] = useState<boolean>(false);
    const [morphDirection, setMorphDirection] = useState<'forward' | 'backward'>('forward');

    const handleMorphAndJumpClick = () => {
        setIsJumping(true);
        setStartAnimation(true);
        setTimeout(() => setIsJumping(false), 1000);
        setMorphDirection(prev => prev === 'forward' ? 'backward' : 'forward');
    };

    //#000000,#00114d,#202040,#002040,#060929
    return (
        <>
            <Suspense fallback={<Loader />}>
                <Canvas style={{ width: '100vh', height: '100vh', backgroundColor: '#01062e' }}>
                    <spotLight position={[2.5, 5, 5]} angle={Math.PI / 3} penumbra={0.5} castShadow shadow-mapSize-height={2048} shadow-mapSize-width={2048} intensity={Math.PI * 50} />
                    <spotLight position={[-2.5, 5, 5]} angle={Math.PI / 3} penumbra={0.5} castShadow shadow-mapSize-height={2048} shadow-mapSize-width={2048} intensity={Math.PI * 50} />
                    <Animations isWalking={isWalking} isJumping={isJumping} />
                    <CustomMesh startAnimation={startAnimation} morphDirection={morphDirection} isWalking={isWalking} />
                    <OrbitControls target={[0, 0.75, 0]} />
                    <EffectComposer>
                        <Bloom
                            intensity={1.0}
                            luminanceThreshold={0.5}
                            luminanceSmoothing={0.9}
                        />
                        <Noise opacity={0.02} />
                    </EffectComposer>
                    <Html>
                        <div style={{ position: 'absolute', top: 0, left: 0, color: 'white', padding: '10px' }}>
                            <button
                                onClick={() => setIsWalking(!isWalking)}
                                style={{ marginRight: '10px' }}
                            >
                                {isWalking ? 'Stop Walking' : 'Walk'}
                            </button>
                            <button
                                onClick={handleMorphAndJumpClick}
                            >
                                Jump
                            </button>
                        </div>
                    </Html>
                    {/*<axesHelper args={[5]} />*/}
                </Canvas>
            </Suspense>
        </>
    )
}
export default Animation;