import { Canvas, useFrame } from '@react-three/fiber'
import { CameraControls, Environment, useGLTF, Html, TransformControls } from '@react-three/drei'
import { Suspense, useState, useEffect, useRef } from 'react'
import { useControls, button } from 'leva'
import * as THREE from 'three'

const MODEL_URL = '/models/jetski_seadooSparkTrixx.glb'

// ============================================================
// ACCESSORY DEFINITIONS — only mesh names live here
// All tunable values live in INITIAL_CONFIG below
// ============================================================

const ACCESSORIES = {
  speakerSystem: {
    label: 'Speaker System',
    svgUrl: '/svg/speaker-mount-jbl.svg',
    meshNames: [
      'jetski_seadooSparkTrixx_product_speakerMount',
      'jetski_seadooSparkTrixx_product_speakerMount_speaker',
    ],
  },
  handleBarPad: {
    label: 'Handlebar Pad',
    svgUrl: '/svg/handlebar-crash-pad.svg',
    meshNames: ['jetski_seadooSparkTrixx_product_handleBarPad'],
  },
}

// Tune in the UI, then paste copied values back here when finalised
const INITIAL_CONFIG = {
  defaultCamera: { position: [0.74, 0.8, -2.15], target: [0, 0.2, 0] },
  speakerSystem: {
    hotspotPosition: [0, 0.7, -0.65],
    explodedOffset: [0, 0.1, 0.2],
    camera: { position: [0.16, 1.05, -0.58], target: [0, 0.8, -0.7] },
  },
  handleBarPad: {
    hotspotPosition: [0, 0.9, -0.2],
    explodedOffset: [0, -0.1, 0.15],
    camera: { position: [0.15, 1.07, -0.06], target: [0, 0.9, -0.2] },
  },
}

const INITIAL_LIGHTING = {
  envPreset: 'studio',     // 'studio' | 'city' | 'sunset' | 'dawn' | 'night' | 'warehouse' | 'forest' | 'apartment' | 'park' | 'lobby'
  envIntensity: 0.6,       // overall HDRI brightness — try 0.3–0.8 for softer
  keyIntensity: 0.6,       // main directional light — lower = softer shadows
  keyPosition: [5, 10, 5], // direction the key light comes from
  fillIntensity: 0.2,      // soft opposite-side light to lift shadows
  background: '#1a1a1a',   // canvas background color
}

// ============================================================
// HOTSPOT
// ============================================================

function Hotspot({ position, onClick, visible, svgUrl }) {
  const [hovered, setHovered] = useState(false)

  return (
    <Html
      position={position}
      center
      distanceFactor={8}
      style={{
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition: 'opacity 0.3s',
      }}
    >
      {svgUrl ? (
        <img
          src={svgUrl}
          alt=""
          draggable={false}
          onClick={onClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            cursor: 'pointer',
            width: 100,
            userSelect: 'none',
            transform: hovered ? 'scale(1.1)' : 'scale(1)',
            transition: 'transform 0.2s ease',
          }}
        />
      ) : (
        <div
          onClick={onClick}
          style={{
            cursor: 'pointer',
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(255, 102, 0, 0.9)',
            border: '2px solid white',
            boxShadow: '0 0 20px rgba(255, 102, 0, 0.6)',
            animation: 'hotspotPulse 2s ease-in-out infinite',
          }}
        />
      )}
      <style>{`
        @keyframes hotspotPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
      `}</style>
    </Html>
  )
}

// ============================================================
// DRAGGABLE MARKER — wireframe sphere with a translate gizmo
// Used in tune mode for both hotspot positions and camera target/pivot points
// ============================================================

function DraggableMarker({ position, color, onChange, gizmoSize = 0.5 }) {
  const meshRef = useRef()

  return (
    <TransformControls
      mode="translate"
      size={gizmoSize}
      onObjectChange={() => {
        if (meshRef.current) {
          const p = meshRef.current.position
          onChange([+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)])
        }
      }}
    >
      <mesh ref={meshRef} position={position}>
        <sphereGeometry args={[0.06, 16, 16]} />
        <meshBasicMaterial color={color} wireframe />
      </mesh>
    </TransformControls>
  )
}

// ============================================================
// MODEL
// ============================================================

function Model({ config, selectedAccessory, tuneMode, onHotspotClick }) {
  const { scene: gltfScene } = useGLTF(MODEL_URL)
  // Clone the scene on mount so we never mutate the cached GLB.
  // This guarantees mesh original positions stay pristine across hot reloads
  // and component remounts — fixes the "speaker mount drifted" issue.
  const [scene] = useState(() => gltfScene.clone(true))
  const accessoryMeshes = useRef({})

  useEffect(() => {
    Object.keys(ACCESSORIES).forEach((k) => {
      accessoryMeshes.current[k] = []
    })
    scene.traverse((obj) => {
      if (!obj.isMesh) return
      const key = Object.keys(ACCESSORIES).find((k) =>
        ACCESSORIES[k].meshNames.some((n) => obj.name.includes(n))
      )
      if (key) {
        accessoryMeshes.current[key].push({
          mesh: obj,
          originalPosition: obj.position.clone(),
        })
      }
    })
  }, [scene])

  useFrame(() => {
    Object.keys(ACCESSORIES).forEach((key) => {
      const meshes = accessoryMeshes.current[key] || []
      // In tune mode, always show exploded so you can position them
      const isExploded = tuneMode || selectedAccessory === key
      const offset = new THREE.Vector3(...config[key].explodedOffset)
      meshes.forEach(({ mesh, originalPosition }) => {
        const target = isExploded
          ? originalPosition.clone().add(offset)
          : originalPosition
        mesh.position.lerp(target, 0.08)
      })
    })
  })

  return (
    <>
      <primitive object={scene} />
      {Object.keys(ACCESSORIES).map((key) => (
        <Hotspot
          key={key}
          position={config[key].hotspotPosition}
          onClick={() => onHotspotClick(key)}
          visible={!tuneMode && !selectedAccessory}
          svgUrl={ACCESSORIES[key].svgUrl}
        />
      ))}
    </>
  )
}

// ============================================================
// CAMERA RIG
// ============================================================

function CameraRig({ config, selectedAccessory, tuneMode, editing, controlsRef }) {
  // Disable right-click TRUCK in tune mode so the pivot stays locked while orbiting.
  // In production mode, lock the camera to orbit-only — no pan, no zoom — so users
  // always see the composed framings exactly as tuned.
  useEffect(() => {
    const cc = controlsRef.current
    if (!cc) return
    if (tuneMode) {
      cc.mouseButtons.right = 0 // ACTION.NONE — no truck (pivot locked)
      cc.mouseButtons.wheel = 8 // ACTION.DOLLY — zoom OK while tuning
      cc.mouseButtons.middle = 8 // ACTION.DOLLY
      cc.touches.two = 0
    } else {
      cc.mouseButtons.right = 0 // disable right-click pan in production
      cc.mouseButtons.wheel = 0 // disable wheel zoom
      cc.mouseButtons.middle = 0 // disable middle-click zoom
      cc.touches.two = 0 // disable two-finger pan/zoom on mobile
    }
  }, [tuneMode])

  // PRODUCTION mode: fly between default view and selected accessory view
  useEffect(() => {
    if (!controlsRef.current || tuneMode) return
    if (selectedAccessory) {
      const c = config[selectedAccessory].camera
      controlsRef.current.setLookAt(...c.position, ...c.target, true)
    } else {
      controlsRef.current.setLookAt(
        ...config.defaultCamera.position,
        ...config.defaultCamera.target,
        true
      )
    }
  }, [selectedAccessory, tuneMode])

  // TUNE mode: when user switches the "preview camera" dropdown, fly to that
  // accessory's saved view. Does NOT re-fly when config values change naturally
  // (e.g. when the user is manually orbiting and we capture position),
  // which prevents the camera from snapping back over manual movement.
  useEffect(() => {
    if (!controlsRef.current || !tuneMode) return
    const target =
      editing === 'default' ? config.defaultCamera : config[editing]?.camera
    if (!target) return
    controlsRef.current.setLookAt(...target.position, ...target.target, true)
    // Intentionally only depends on `editing` and `tuneMode` — config changes
    // from sliders/gizmos are handled by their own onChange handlers below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, tuneMode])

  // Expose an imperative way for slider/gizmo handlers to push camera updates
  // without going through the dependency chain that would cause snap-back.
  useEffect(() => {
    if (!controlsRef.current || !tuneMode) return
    const handler = (e) => {
      const { position, target } = e.detail
      controlsRef.current.setLookAt(...position, ...target, false)
    }
    window.addEventListener('jetski:tune-set-camera', handler)
    return () => window.removeEventListener('jetski:tune-set-camera', handler)
  }, [tuneMode])

  return <CameraControls ref={controlsRef} makeDefault smoothTime={0.8} />
}

// ============================================================
// MAIN APP
// ============================================================

function formatConfig(config, lighting) {
  const arr = (a) => `[${a.map((n) => +n.toFixed(2)).join(', ')}]`
  return `const INITIAL_CONFIG = {
  defaultCamera: { position: ${arr(config.defaultCamera.position)}, target: ${arr(config.defaultCamera.target)} },
  speakerSystem: {
    hotspotPosition: ${arr(config.speakerSystem.hotspotPosition)},
    explodedOffset: ${arr(config.speakerSystem.explodedOffset)},
    camera: { position: ${arr(config.speakerSystem.camera.position)}, target: ${arr(config.speakerSystem.camera.target)} },
  },
  handleBarPad: {
    hotspotPosition: ${arr(config.handleBarPad.hotspotPosition)},
    explodedOffset: ${arr(config.handleBarPad.explodedOffset)},
    camera: { position: ${arr(config.handleBarPad.camera.position)}, target: ${arr(config.handleBarPad.camera.target)} },
  },
}

const INITIAL_LIGHTING = {
  envPreset: '${lighting.envPreset}',
  envIntensity: ${+lighting.envIntensity.toFixed(2)},
  keyIntensity: ${+lighting.keyIntensity.toFixed(2)},
  keyPosition: ${arr(lighting.keyPosition)},
  fillIntensity: ${+lighting.fillIntensity.toFixed(2)},
  background: '${lighting.background}',
}`
}

export default function App() {
  const [selectedAccessory, setSelectedAccessory] = useState(null)
  const [config, setConfig] = useState(INITIAL_CONFIG)
  const [lighting, setLighting] = useState(INITIAL_LIGHTING)
  const cameraRef = useRef()

  // configRef always holds the latest config — bypasses stale closure in leva button callbacks
  const configRef = useRef(config)
  useEffect(() => {
    configRef.current = config
  }, [config])

  // Same pattern for lighting state
  const lightingRef = useRef(lighting)
  useEffect(() => {
    lightingRef.current = lighting
  }, [lighting])

  // Holds leva set() functions per accessory so we can push updated values
  // back into the slider display (capture buttons & gizmo drags don't auto-sync otherwise)
  const levaSetters = useRef({})

  // Tracks which camera is currently being edited in tune mode (used by the helpers below).
  // Mirrors the leva `editing` value via a ref so onChange handlers see the latest value.
  const editingRef = useRef('default')

  // When a camera-related slider/gizmo changes for the currently-edited target,
  // imperatively move the camera so the user sees the change live — without
  // creating a useEffect dependency that would snap-back during manual orbiting.
  const dispatchCameraIfEditing = (target, partial) => {
    if (editingRef.current !== target) return
    const current =
      target === 'default'
        ? configRef.current.defaultCamera
        : configRef.current[target].camera
    const merged = { ...current, ...partial }
    window.dispatchEvent(
      new CustomEvent('jetski:tune-set-camera', { detail: merged })
    )
  }

  // ---- LEVA: Mode ----
  const { tuneMode } = useControls({
    tuneMode: { value: false, label: '🛠 Tune Mode' },
  })

  // ---- LEVA: Tune Editor (which camera is currently being composed) ----
  const [{ editing }] = useControls('Tune Editor', () => ({
    editing: {
      value: 'default',
      options: ['default', 'speakerSystem', 'handleBarPad'],
      label: 'preview camera',
    },
  }))

  // Mirror editing into a ref so imperative handlers can read it without re-binding
  useEffect(() => {
    editingRef.current = editing
  }, [editing])

  useEffect(() => {
    if (tuneMode) setSelectedAccessory(null)
  }, [tuneMode])

  // Helper to update a nested config value
  const updateConfig = (path, value) => {
    setConfig((prev) => {
      const next = { ...prev }
      const parts = path.split('.')
      let target = next
      for (let i = 0; i < parts.length - 1; i++) {
        target[parts[i]] = { ...target[parts[i]] }
        target = target[parts[i]]
      }
      target[parts[parts.length - 1]] = value
      return next
    })
  }

  // Capture current camera into config + sync leva sliders to show new values
  const captureCamera = (target) => {
    const cc = cameraRef.current
    if (!cc) {
      console.warn('Camera not ready')
      return
    }
    const pos = new THREE.Vector3()
    const tgt = new THREE.Vector3()
    cc.getPosition(pos)
    cc.getTarget(tgt)
    const round = (n) => +n.toFixed(2)
    const positionArr = [round(pos.x), round(pos.y), round(pos.z)]
    const targetArr = [round(tgt.x), round(tgt.y), round(tgt.z)]
    if (target === 'default') {
      updateConfig('defaultCamera', { position: positionArr, target: targetArr })
      // sync leva display
      levaSetters.current.default?.({ position: positionArr, target: targetArr })
    } else {
      updateConfig(`${target}.camera`, { position: positionArr, target: targetArr })
      // sync leva display (note: schema keys are cameraPos & cameraTarget for accessories)
      levaSetters.current[target]?.({ cameraPos: positionArr, cameraTarget: targetArr })
    }
    console.log(`📷 Captured camera for ${target}:`, { position: positionArr, target: targetArr })
  }

  // ---- LEVA: Default Camera ----
  const [, setDefaultCamLeva] = useControls('Default Camera', () => ({
    position: {
      value: INITIAL_CONFIG.defaultCamera.position,
      step: 0.1,
      onChange: (v) => {
        updateConfig('defaultCamera.position', v)
        dispatchCameraIfEditing('default', { position: v })
      },
      transient: false,
    },
    target: {
      value: INITIAL_CONFIG.defaultCamera.target,
      step: 0.1,
      label: 'target (pivot)',
      onChange: (v) => {
        updateConfig('defaultCamera.target', v)
        dispatchCameraIfEditing('default', { target: v })
      },
      transient: false,
    },
    'Capture Current View': button(() => captureCamera('default')),
  }))
  levaSetters.current.default = setDefaultCamLeva

  // ---- LEVA: Speaker System ----
  const [, setSpeakerLeva] = useControls('Speaker System', () => ({
    hotspot: {
      value: INITIAL_CONFIG.speakerSystem.hotspotPosition,
      step: 0.05,
      onChange: (v) => updateConfig('speakerSystem.hotspotPosition', v),
      transient: false,
    },
    explode: {
      value: INITIAL_CONFIG.speakerSystem.explodedOffset,
      step: 0.05,
      onChange: (v) => updateConfig('speakerSystem.explodedOffset', v),
      transient: false,
    },
    cameraPos: {
      value: INITIAL_CONFIG.speakerSystem.camera.position,
      step: 0.1,
      label: 'cam pos',
      onChange: (v) => {
        updateConfig('speakerSystem.camera.position', v)
        dispatchCameraIfEditing('speakerSystem', { position: v })
      },
      transient: false,
    },
    cameraTarget: {
      value: INITIAL_CONFIG.speakerSystem.camera.target,
      step: 0.1,
      label: 'cam target (pivot)',
      onChange: (v) => {
        updateConfig('speakerSystem.camera.target', v)
        dispatchCameraIfEditing('speakerSystem', { target: v })
      },
      transient: false,
    },
    'Capture Camera': button(() => captureCamera('speakerSystem')),
  }))
  levaSetters.current.speakerSystem = setSpeakerLeva

  // ---- LEVA: Handlebar Pad ----
  const [, setHandlebarLeva] = useControls('Handlebar Pad', () => ({
    hotspot: {
      value: INITIAL_CONFIG.handleBarPad.hotspotPosition,
      step: 0.05,
      onChange: (v) => updateConfig('handleBarPad.hotspotPosition', v),
      transient: false,
    },
    explode: {
      value: INITIAL_CONFIG.handleBarPad.explodedOffset,
      step: 0.05,
      onChange: (v) => updateConfig('handleBarPad.explodedOffset', v),
      transient: false,
    },
    cameraPos: {
      value: INITIAL_CONFIG.handleBarPad.camera.position,
      step: 0.1,
      label: 'cam pos',
      onChange: (v) => {
        updateConfig('handleBarPad.camera.position', v)
        dispatchCameraIfEditing('handleBarPad', { position: v })
      },
      transient: false,
    },
    cameraTarget: {
      value: INITIAL_CONFIG.handleBarPad.camera.target,
      step: 0.1,
      label: 'cam target (pivot)',
      onChange: (v) => {
        updateConfig('handleBarPad.camera.target', v)
        dispatchCameraIfEditing('handleBarPad', { target: v })
      },
      transient: false,
    },
    'Capture Camera': button(() => captureCamera('handleBarPad')),
  }))
  levaSetters.current.handleBarPad = setHandlebarLeva

  // ---- LEVA: Lighting ----
  useControls('Lighting', {
    envPreset: {
      value: INITIAL_LIGHTING.envPreset,
      options: ['studio', 'city', 'sunset', 'dawn', 'night', 'warehouse', 'forest', 'apartment', 'park', 'lobby'],
      label: 'environment',
      onChange: (v) => setLighting((l) => ({ ...l, envPreset: v })),
      transient: false,
    },
    envIntensity: {
      value: INITIAL_LIGHTING.envIntensity,
      min: 0,
      max: 2,
      step: 0.05,
      label: 'env intensity',
      onChange: (v) => setLighting((l) => ({ ...l, envIntensity: v })),
      transient: false,
    },
    keyIntensity: {
      value: INITIAL_LIGHTING.keyIntensity,
      min: 0,
      max: 3,
      step: 0.05,
      label: 'key light',
      onChange: (v) => setLighting((l) => ({ ...l, keyIntensity: v })),
      transient: false,
    },
    keyPosition: {
      value: INITIAL_LIGHTING.keyPosition,
      step: 0.5,
      label: 'key position',
      onChange: (v) => setLighting((l) => ({ ...l, keyPosition: v })),
      transient: false,
    },
    fillIntensity: {
      value: INITIAL_LIGHTING.fillIntensity,
      min: 0,
      max: 2,
      step: 0.05,
      label: 'fill light',
      onChange: (v) => setLighting((l) => ({ ...l, fillIntensity: v })),
      transient: false,
    },
    background: {
      value: INITIAL_LIGHTING.background,
      label: 'background',
      onChange: (v) => setLighting((l) => ({ ...l, background: v })),
      transient: false,
    },
  })
  useControls('Export', {
    'Copy Config to Clipboard': button(() => {
      // Read from refs to get the latest values, not stale closure values
      const code = formatConfig(configRef.current, lightingRef.current)
      console.log('📋 Copying config:', { config: configRef.current, lighting: lightingRef.current })
      navigator.clipboard.writeText(code).then(
        () => alert('✅ Config copied! Paste it over the INITIAL_CONFIG and INITIAL_LIGHTING blocks in App.jsx'),
        () => {
          console.log(code)
          alert('Clipboard blocked — config logged to console instead')
        }
      )
    }),
    'Reset Panel (after pasting config)': button(() => {
      Object.keys(localStorage)
        .filter((k) => k.toLowerCase().includes('leva'))
        .forEach((k) => localStorage.removeItem(k))
      window.location.reload()
    }),
  })

  // Broadcast selection state via custom DOM events for the parent site
  useEffect(() => {
    if (selectedAccessory) {
      window.dispatchEvent(
        new CustomEvent('jetski:accessory-selected', {
          detail: {
            key: selectedAccessory,
            label: ACCESSORIES[selectedAccessory].label,
          },
        })
      )
    } else {
      window.dispatchEvent(new CustomEvent('jetski:reset'))
    }
  }, [selectedAccessory])

  // Listen for external reset (so site sidebar close button can also reset 3D)
  useEffect(() => {
    const handler = () => setSelectedAccessory(null)
    window.addEventListener('jetski:request-reset', handler)
    return () => window.removeEventListener('jetski:request-reset', handler)
  }, [])

  return (
    <div style={{ width: '100vw', height: '100vh', background: lighting.background, position: 'relative' }}>
      {!tuneMode && selectedAccessory && (
        <button
          onClick={() => setSelectedAccessory(null)}
          style={{
            position: 'absolute', top: 20, left: 20, zIndex: 100,
            padding: '10px 18px', background: 'rgba(0,0,0,0.75)', color: 'white',
            border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8,
            cursor: 'pointer', fontFamily: 'system-ui', fontSize: 14,
            backdropFilter: 'blur(10px)',
          }}
        >
          ← Back to Jetski
        </button>
      )}

      {tuneMode && (
        <div
          style={{
            position: 'absolute', top: 20, left: 20, zIndex: 100,
            padding: '12px 16px', background: 'rgba(255,102,0,0.9)', color: 'white',
            borderRadius: 8, fontFamily: 'system-ui', fontSize: 13, maxWidth: 380,
            backdropFilter: 'blur(10px)', lineHeight: 1.5,
          }}
        >
          <strong>🛠 Tune Mode</strong><br/>
          Pick a camera to compose with the <em>preview camera</em> dropdown. Drag pivots and orbit around them — right-click pan is disabled so the pivot stays locked.<br/>
          🟠 hotspots &nbsp; 🔵 default pivot &nbsp; 🟡 accessory pivots<br/>
          Press <kbd>H</kbd> to hide the panel.
        </div>
      )}

      {!tuneMode && selectedAccessory && (
        <div
          style={{
            position: 'absolute', top: 20, right: 20, zIndex: 100,
            background: 'rgba(0,0,0,0.75)', padding: '10px 16px', borderRadius: 8,
            color: 'white', fontFamily: 'system-ui', fontSize: 13,
            backdropFilter: 'blur(10px)',
          }}
        >
          Selected: <strong>{ACCESSORIES[selectedAccessory].label}</strong>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            (Sidebar would open here)
          </div>
        </div>
      )}

      <Canvas shadows>
        <Suspense fallback={null}>
          <Environment preset={lighting.envPreset} environmentIntensity={lighting.envIntensity} />
          <directionalLight position={lighting.keyPosition} intensity={lighting.keyIntensity} castShadow />
          <directionalLight position={[-lighting.keyPosition[0], lighting.keyPosition[1] * 0.5, -lighting.keyPosition[2]]} intensity={lighting.fillIntensity} />
          <Model
            config={config}
            selectedAccessory={selectedAccessory}
            tuneMode={tuneMode}
            onHotspotClick={setSelectedAccessory}
          />
          {tuneMode && (
            <>
              {/* Hotspot drag gizmos (orange) */}
              {Object.keys(ACCESSORIES).map((key) => (
                <DraggableMarker
                  key={`hot-${key}`}
                  position={config[key].hotspotPosition}
                  color="#ff6600"
                  onChange={(v) => {
                    updateConfig(`${key}.hotspotPosition`, v)
                    levaSetters.current[key]?.({ hotspot: v })
                  }}
                />
              ))}
              {/* Default camera pivot (cyan) */}
              <DraggableMarker
                position={config.defaultCamera.target}
                color="#00ffff"
                onChange={(v) => {
                  updateConfig('defaultCamera.target', v)
                  levaSetters.current.default?.({ target: v })
                  dispatchCameraIfEditing('default', { target: v })
                }}
              />
              {/* Per-accessory camera pivots (yellow) */}
              {Object.keys(ACCESSORIES).map((key) => (
                <DraggableMarker
                  key={`cam-${key}`}
                  position={config[key].camera.target}
                  color="#ffff00"
                  onChange={(v) => {
                    updateConfig(`${key}.camera.target`, v)
                    levaSetters.current[key]?.({ cameraTarget: v })
                    dispatchCameraIfEditing(key, { target: v })
                  }}
                />
              ))}
            </>
          )}
          <CameraRig
            config={config}
            selectedAccessory={selectedAccessory}
            tuneMode={tuneMode}
            editing={editing}
            controlsRef={cameraRef}
          />
        </Suspense>
      </Canvas>
    </div>
  )
}

useGLTF.preload(MODEL_URL)