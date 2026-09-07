import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useTranslation } from "react-i18next";
import { type ResolvedTheme } from "../../../constants/settingsOptions";
import { applyThemeToObject, disposeObject3D, loadObjectFromAsset, paletteForTheme } from "../../../utils/modelLoaders";

type ModelViewerProps = {
  url: string;
  ext: string;
  viewKey?: string;
  theme: ResolvedTheme;
  /** Overrides the theme-derived material color (e.g. the fixed "red plate" look used by the
   *  model detail page's 3D preview modal) while keeping the rest of the palette intact. */
  colorOverride?: string;
};

type ViewErrorKey = "unsupported" | "failed";

export default function ModelViewer({ url, ext, viewKey, theme, colorOverride }: ModelViewerProps) {
  const { t } = useTranslation(["library"]);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [viewError, setViewError] = useState<ViewErrorKey | null>(null);

  useEffect(() => {
    let disposed = false;
    let activeObject: THREE.Object3D | null = null;
    const mount = mountRef.current;
    if (!mount) return;
    const palette = paletteForTheme(theme);
    if (colorOverride) palette.color = new THREE.Color(colorOverride);
    setViewError(null);
    const reportError = (key: ViewErrorKey) => {
      if (!disposed) {
        setViewError(key);
      }
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(mount.clientWidth || 300, mount.clientHeight || 300);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.6));
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const dir1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dir1.position.set(3, 6, 2);
    const dir2 = new THREE.DirectionalLight(0xffffff, 1.2);
    dir2.position.set(-4, -2, 3);
    scene.add(dir1);
    scene.add(dir2);
    camera.position.set(1, 1, 3);

    let controls: any;
    let teardown: (() => void) | undefined;
    const storageKey = viewKey ? `ps-view-${viewKey}` : null;

    const loadSavedView = () => {
      if (!storageKey || typeof window === "undefined") return false;
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return false;
        const data = JSON.parse(raw);
        if (!Array.isArray(data?.position) || !Array.isArray(data?.target)) return false;
        camera.position.fromArray(data.position);
        controls?.target.fromArray(data.target);
        controls?.update();
        return true;
      } catch (err) {
        console.warn("Failed to load saved view", err);
        return false;
      }
    };

    const saveView = () => {
      if (!storageKey || typeof window === "undefined" || !controls) return;
      try {
        const payload = {
          position: camera.position.toArray(),
          target: controls.target.toArray(),
        };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {}
    };

    (async () => {
      try {
        const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.enablePan = true;
        controls.target.set(0, 0, 0);
        controls.addEventListener("change", saveView);

        const centerSceneOn = (box: THREE.Box3) => {
          const size = box.getSize(new THREE.Vector3());
          const center = box.getCenter(new THREE.Vector3());
          const radius = Math.max(size.x, size.y, size.z) || 1;
          if (!loadSavedView()) {
            camera.position.copy(center).add(new THREE.Vector3(radius * 1.8, radius * 1.2, radius * 1.8));
            camera.lookAt(center);
            controls?.target.copy(center);
            controls?.update();
          }
        };

        const e = (ext || "").toLowerCase();

        try {
          const obj = await loadObjectFromAsset(e, url);
          if (!obj) {
            reportError("unsupported");
            return;
          }
          if (disposed) {
            disposeObject3D(obj);
            return;
          }
          applyThemeToObject(obj, palette);
          activeObject = obj;
          scene.add(obj);
          const box = new THREE.Box3().setFromObject(obj);
          if (!box.isEmpty()) {
            centerSceneOn(box);
          }
        } catch (err) {
          console.error("Viewer asset load failed:", err);
          reportError("failed");
        }
      } catch (err) {
        console.error("Viewer init failed:", err);
      }

      const onResize = () => {
        if (!mount) return;
        const w = mount.clientWidth || 300;
        const h = mount.clientHeight || 300;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      teardown = () => window.removeEventListener("resize", onResize);

      const animate = () => {
        if (disposed) return;
        renderer.render(scene, camera);
        requestAnimationFrame(animate);
      };
      animate();
    })();

  return () => {
    disposed = true;
    try {
      teardown?.();
      mount.removeChild(renderer.domElement);
    } catch {}
    if (activeObject) {
      disposeObject3D(activeObject);
    }
    try {
      controls?.removeEventListener("change", saveView);
      controls?.dispose();
    } catch {}
    try {
      renderer.forceContextLoss?.();
    } catch {}
    renderer.dispose();
  };
}, [url, ext, viewKey, theme, colorOverride]);

  return (
    <Box
      ref={mountRef}
      sx={{
        width: "100%",
        height: "100%",
        bgcolor: "action.hover",
        borderRadius: 1,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {viewError && (
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            px: 2,
            textAlign: "center",
            bgcolor: "rgba(0, 0, 0, 0.55)",
          }}
        >
          <Typography variant="body2" fontWeight={600} color="error.light">
            {viewError === "unsupported"
              ? t("library:modelViewer.previewUnsupported")
              : t("library:modelViewer.previewFailed")}
          </Typography>
        </Box>
      )}
    </Box>
  );
}
