// A small "which way am I looking at this from" cube, rendered into a corner of the main
// viewer's own canvas via a scissored sub-viewport (the standard three.js technique for
// compositing a second mini-scene into one WebGL canvas without a second <canvas>/renderer).
import * as THREE from "three";

const GIZMO_SIZE = 72;
const GIZMO_MARGIN = 12;

// BoxGeometry's per-face material array is ordered [+X, -X, +Y, -Y, +Z, -Z]. The scene is set up
// Y-up (see modelLoaders.ts's Z-up -> Y-up conversion), and the viewer's default camera looks
// in mostly from +Z, so +Z reads naturally as "front" here.
const FACE_LABELS = ["RIGHT", "LEFT", "TOP", "BOTTOM", "FRONT", "BACK"];

function makeFaceTexture(label: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = label === "FRONT" ? "#e6f7e6" : "#f2f2f2";
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = "#bdbdbd";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, size - 6, size - 6);
  ctx.fillStyle = "#424242";
  ctx.font = '700 20px "Open Sans", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export type OrientationGizmo = {
  /** Call once per frame, after the main scene has been rendered into the full viewport. */
  render: (mainCamera: THREE.Camera, target: THREE.Vector3, viewportWidth: number, viewportHeight: number) => void;
  dispose: () => void;
};

export function createOrientationGizmo(renderer: THREE.WebGLRenderer): OrientationGizmo {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1.6, 1.6, 1.6, -1.6, 0.1, 10);

  const textures = FACE_LABELS.map(makeFaceTexture);
  const materials = textures.map(map => new THREE.MeshBasicMaterial({ map }));
  const geometry = new THREE.BoxGeometry(1.8, 1.8, 1.8);
  const cube = new THREE.Mesh(geometry, materials);
  scene.add(cube);

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry),
    new THREE.LineBasicMaterial({ color: 0x9a9a9a })
  );
  scene.add(edges);

  const dir = new THREE.Vector3();

  return {
    render(mainCamera, target, viewportWidth, viewportHeight) {
      dir.copy(mainCamera.position).sub(target);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(4);
      camera.position.copy(dir);
      camera.up.copy(mainCamera.up);
      camera.lookAt(0, 0, 0);

      // Bottom-right: clear of the "3D Preview" button (bottom-left) and the preview modal's
      // close button (top-right). three.js viewport/scissor y=0 is the canvas BOTTOM, so a low y
      // here places this near the visual bottom.
      const x = viewportWidth - GIZMO_SIZE - GIZMO_MARGIN;
      const y = GIZMO_MARGIN;
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, GIZMO_SIZE, GIZMO_SIZE);
      renderer.setViewport(x, y, GIZMO_SIZE, GIZMO_SIZE);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, viewportWidth, viewportHeight);
    },
    dispose() {
      geometry.dispose();
      edges.geometry.dispose();
      (edges.material as THREE.Material).dispose();
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    },
  };
}
