// Card-thumbnail snapshot generation for 3D models: a serialized job queue (only one WebGL
// snapshot renderer is ever live at a time, since spinning up many WebGL contexts concurrently is
// what caused the original flakiness this queue was written to avoid), a data-URL cache keyed by
// plate id (falling back to the asset URL), and the actual "render one frame of the model to a
// PNG" routine. Used by ModelSnapshot (routes/library/components/ModelViewer/components); no
// React dependency here, hence services/ rather than utils/.
import * as THREE from "three";
import type { ResolvedTheme } from "../constants/settingsOptions";
import { applyThemeToObject, disposeObject3D, loadObjectFromAsset, paletteForTheme } from "./modelLoaders";

export const snapshotCache = new Map<string, string>();

let snapshotRenderer: THREE.WebGLRenderer | null = null;
let snapshotLock: Promise<void> = Promise.resolve();
let snapshotJobQueue: Promise<void> = Promise.resolve();

/** Serializes snapshot jobs one-at-a-time across every ModelSnapshot instance on the page. */
export function queueSnapshotJob<T>(job: () => Promise<T>): Promise<T> {
  const result = snapshotJobQueue.then(job, job);
  snapshotJobQueue = result.then(() => undefined, () => undefined);
  return result;
}

function createSnapshotRenderer() {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  return renderer;
}

async function acquireSnapshotRenderer() {
  let release!: () => void;
  const wait = snapshotLock;
  snapshotLock = snapshotLock.then(() => new Promise<void>(resolve => (release = resolve)));
  await wait;
  snapshotRenderer = createSnapshotRenderer();
  const renderer = snapshotRenderer;
  const unlock = () => {
    try {
      renderer.forceContextLoss?.();
      renderer.dispose();
    } catch {}
    snapshotRenderer = null;
    release();
  };
  return { renderer, release: unlock };
}

export async function generateModelSnapshot(
  url: string,
  ext: string,
  width: number,
  height: number,
  theme: ResolvedTheme
) {
  const normalized = (ext || "").toLowerCase();
  const object = await loadObjectFromAsset(normalized, url);
  if (!object) {
    throw new Error(`Unsupported snapshot extension: ${ext}`);
  }
  applyThemeToObject(object, paletteForTheme(theme));
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
  const { renderer, release } = await acquireSnapshotRenderer();
  renderer.setSize(width, height, false);
  scene.add(object);

  const box = new THREE.Box3().setFromObject(object);
  if (!box.isEmpty()) {
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z) || 1;
    camera.position.copy(center).add(new THREE.Vector3(radius * 1.8, radius * 1.3, radius * 1.6));
    camera.lookAt(center);
  } else {
    camera.position.set(1, 1, 3);
    camera.lookAt(new THREE.Vector3(0, 0, 0));
  }

  try {
    renderer.render(scene, camera);
    const dataUrl = renderer.domElement.toDataURL("image/png");
    disposeObject3D(object);
    return dataUrl;
  } finally {
    release();
  }
}
