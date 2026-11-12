import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  type BufferGeometry,
} from 'three';
import { samplePose, type Joint, type KuklaLevel } from '@shared/kukla';
import type { RoundPublicState } from '@shared/types';
import { createDisposer } from '../../lib/disposer';
import { serverNow } from '../../net/connection';
import './kukla.css';

type Anim = NonNullable<RoundPublicState['anim']>;

/**
 * Kukla sahnesi (Three.js, sadece Kukla turunda yüklenir). Poz, sunucunun verdiği `startedAt`
 * ve senkronize sunucu saatinden hesaplanır; ağdan kukla verisi akmaz. Animasyon 10 sn'de
 * bir baştan başlar. Unmount'ta geometri, materyal, renderer, bağlam, rAF ve gözlemci temizlenir.
 */
export default function KuklaStage({ anim }: { anim: Anim | null }) {
  const host = useRef<HTMLDivElement>(null);
  const animRef = useRef(anim);
  animRef.current = anim;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const d = createDisposer();

    const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'kukla__canvas';
    el.appendChild(renderer.domElement);
    d.add(() => {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });

    const geoms: BufferGeometry[] = [];
    const body = new MeshStandardMaterial({ color: 0x6c8cff, roughness: 0.6 });
    const skin = new MeshStandardMaterial({ color: 0xffd2a8, roughness: 0.8 });
    const floor = new MeshStandardMaterial({ color: 0x2a2f45, roughness: 1 });
    d.add(() => {
      geoms.forEach((g) => g.dispose());
      body.dispose();
      skin.dispose();
      floor.dispose();
    });
    const geo = <T extends BufferGeometry>(g: T): T => (geoms.push(g), g);

    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.4));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const camera = new PerspectiveCamera(38, 1, 0.1, 50);
    camera.position.set(0, 1.25, 5.2);
    camera.lookAt(0, 1.1, 0);

    const ground = new Mesh(geo(new CircleGeometry(1.3, 32)), floor);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // --- Kukla: eklem hiyerarşisi ---
    const joints = {} as Record<Joint, Group>;
    const g = (name: Joint, parent: Group, x = 0, y = 0): Group => {
      const grp = new Group();
      grp.position.set(x, y, 0);
      parent.add(grp);
      joints[name] = grp;
      return grp;
    };
    const limb = (parent: Group, len: number, r: number, mat = body) => {
      const m = new Mesh(geo(new CylinderGeometry(r, r * 0.9, len, 10)), mat);
      m.position.y = -len / 2;
      parent.add(m);
    };

    const root = new Group();
    scene.add(root);
    const hips = g('hips', root, 0, 1.0);
    hips.add(new Mesh(geo(new BoxGeometry(0.38, 0.2, 0.2)), body));
    const spine = g('spine', hips, 0, 0.1);
    const torso = new Mesh(geo(new BoxGeometry(0.42, 0.55, 0.22)), body);
    torso.position.y = 0.3;
    spine.add(torso);
    const head = g('head', spine, 0, 0.62);
    const skull = new Mesh(geo(new SphereGeometry(0.16, 20, 16)), skin);
    skull.position.y = 0.14;
    head.add(skull);
    const shL = g('shL', spine, 0.29, 0.52);
    const shR = g('shR', spine, -0.29, 0.52);
    limb(shL, 0.36, 0.055);
    limb(shR, 0.36, 0.055);
    const elL = g('elL', shL, 0, -0.36);
    const elR = g('elR', shR, 0, -0.36);
    limb(elL, 0.34, 0.05, skin);
    limb(elR, 0.34, 0.05, skin);
    const hpL = g('hpL', hips, 0.11, -0.08);
    const hpR = g('hpR', hips, -0.11, -0.08);
    limb(hpL, 0.42, 0.075);
    limb(hpR, 0.42, 0.075);
    const knL = g('knL', hpL, 0, -0.42);
    const knR = g('knR', hpR, 0, -0.42);
    limb(knL, 0.42, 0.065);
    limb(knR, 0.42, 0.065);

    const sil = new Color(0x161826);
    const bodyColor = body.color.clone();
    const skinColor = skin.color.clone();
    let silhouette = false;

    const resize = () => {
      const w = el.clientWidth || 300;
      const h = el.clientHeight || 300;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    d.add(() => ro.disconnect());
    resize();

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const a = animRef.current;
      if (!a) return;
      const t = (serverNow() - a.startedAt) / 1000;
      const p = samplePose(a.clip, Math.max(0, t), a.level as KuklaLevel);
      for (const j of Object.keys(joints) as Joint[]) joints[j].rotation.set(p.rot[j][0], p.rot[j][1], p.rot[j][2]);
      root.position.set(p.pos[0], p.pos[1], p.pos[2]);
      if (p.silhouette !== silhouette) {
        silhouette = p.silhouette;
        body.color.copy(silhouette ? sil : bodyColor);
        skin.color.copy(silhouette ? sil : skinColor);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    d.add(() => cancelAnimationFrame(raf));

    return () => d.dispose();
  }, []);

  return <div ref={host} className="kukla" role="img" aria-label="Kukla animasyonu" />;
}
