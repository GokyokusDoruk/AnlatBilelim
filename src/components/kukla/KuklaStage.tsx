import { useEffect, useRef } from 'react';
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Points,
  PointsMaterial,
  RingGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  WebGLRenderer,
  type Material,
} from 'three';
import { KUKLA_FACES, samplePose, type Face, type Joint, type KuklaLevel } from '@shared/kukla';
import type { RoundPublicState } from '@shared/types';
import { createDisposer } from '../../lib/disposer';
import { serverNow } from '../../net/connection';
import './kukla.css';

type Anim = NonNullable<RoundPublicState['anim']>;
const TAU = Math.PI * 2;

/**
 * Kukla sahnesi (Three.js, sadece Kukla turunda yüklenir). Poz, sunucunun verdiği `startedAt`
 * ve senkronize sunucu saatinden hesaplanır; ağdan kukla verisi akmaz. Animasyon 10 sn'de
 * bir baştan başlar. Seviye 1-2'de yüz ifadesi ve elde eşya görünür; 3-4'te figür siluet olur.
 * Unmount'ta geometri, materyal, renderer, bağlam, rAF ve gözlemci temizlenir.
 */
export default function KuklaStage({ anim }: { anim: Anim | null }) {
  const host = useRef<HTMLDivElement>(null);
  const animRef = useRef(anim);
  animRef.current = anim;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const d = createDisposer();

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    } catch {
      // WebGL kapalı/desteksiz cihaz: sahne boş kalmasın, kullanıcıya nedenini söyle.
      const msg = document.createElement('p');
      msg.className = 'kukla__fallback';
      msg.textContent = 'Bu cihazda 3B animasyon (WebGL) açılamadı. Tarayıcıyı güncelle ya da başka bir tarayıcı dene.';
      el.appendChild(msg);
      return () => msg.remove();
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.className = 'kukla__canvas';
    el.appendChild(renderer.domElement);
    d.add(() => {
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    });

    // --- Kaynak takibi: oluşturulan her geometri / materyal unmount'ta bırakılır ---
    const geoms: BufferGeometry[] = [];
    const mats: Material[] = [];
    d.add(() => {
      geoms.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    });
    const geo = <T extends BufferGeometry>(g: T): T => (geoms.push(g), g);
    const std = (color: number, roughness = 0.65) => {
      const m = new MeshStandardMaterial({ color, roughness });
      mats.push(m);
      return m;
    };
    const basic = (color: number, opacity = 1) => {
      const m = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
      mats.push(m);
      return m;
    };

    // Siluet (seviye 3-4) için boyanacak materyaller, asıl renkleriyle birlikte.
    const tinted: { mat: MeshStandardMaterial; color: Color }[] = [];
    const tint = (color: number, roughness?: number) => {
      const m = std(color, roughness);
      tinted.push({ mat: m, color: m.color.clone() });
      return m;
    };
    const shirt = tint(0xff6b6b);
    const pants = tint(0x4c6fff);
    const skin = tint(0xffd2a8, 0.8);
    const hair = tint(0x5b3a29, 0.9);
    const shoe = tint(0xf5f5f5, 0.5);
    const prop = tint(0xc9a227, 0.5);
    const propDark = tint(0x555b6e, 0.5);

    const scene = new Scene();
    scene.add(new AmbientLight(0xffffff, 1.2));
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(2, 4, 3);
    scene.add(sun);
    const rim = new DirectionalLight(0x9cc2ff, 1.1);
    rim.position.set(-3, 2, -2);
    scene.add(rim);
    const camera = new PerspectiveCamera(38, 1, 0.1, 50);
    const lookY = 1.1;

    // --- Zemin: parlayan halka + yumuşak gölge ---
    const ground = new Mesh(geo(new CircleGeometry(1.3, 40)), std(0x2a2f45, 1));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const ring = new Mesh(geo(new RingGeometry(1.22, 1.3, 48)), basic(0xffd23f, 0.55));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.004;
    scene.add(ring);
    const shadow = new Mesh(geo(new CircleGeometry(0.32, 24)), basic(0x000000, 0.35));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.008;
    scene.add(shadow);

    // --- Süzülen konfeti tozu ---
    const N = 46;
    const pg = geo(new BufferGeometry());
    const pPos = new Float32Array(N * 3);
    const pCol = new Float32Array(N * 3);
    const palette = [0xffd23f, 0xff6b6b, 0x6c8cff, 0x5be3a3, 0xd18cff].map((c) => new Color(c));
    for (let i = 0; i < N; i++) {
      pPos.set([(Math.random() - 0.5) * 4.2, Math.random() * 2.8, (Math.random() - 0.5) * 2.4 - 0.6], i * 3);
      const c = palette[i % palette.length]!;
      pCol.set([c.r, c.g, c.b], i * 3);
    }
    pg.setAttribute('position', new Float32BufferAttribute(pPos, 3));
    pg.setAttribute('color', new Float32BufferAttribute(pCol, 3));
    const pm = new PointsMaterial({ size: 0.05, vertexColors: true, transparent: true, opacity: 0.8 });
    mats.push(pm);
    const dust = new Points(pg, pm);
    scene.add(dust);

    // --- Kukla: eklem hiyerarşisi ---
    const joints = {} as Record<Joint, Group>;
    const g = (name: Joint, parent: Group, x = 0, y = 0): Group => {
      const grp = new Group();
      grp.position.set(x, y, 0);
      parent.add(grp);
      joints[name] = grp;
      return grp;
    };
    const mesh = (geom: BufferGeometry, mat: Material, parent: Group, x = 0, y = 0, z = 0) => {
      const m = new Mesh(geo(geom), mat);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const limb = (parent: Group, len: number, r: number, mat: Material) => mesh(new CylinderGeometry(r, r * 0.9, len, 12), mat, parent, 0, -len / 2);

    const root = new Group();
    scene.add(root);
    const hips = g('hips', root, 0, 1.0);
    mesh(new BoxGeometry(0.38, 0.2, 0.2), pants, hips);
    const spine = g('spine', hips, 0, 0.1);
    mesh(new BoxGeometry(0.42, 0.55, 0.22), shirt, spine, 0, 0.3);
    mesh(new CylinderGeometry(0.05, 0.06, 0.1, 10), skin, spine, 0, 0.6);
    const head = g('head', spine, 0, 0.62);
    mesh(new SphereGeometry(0.17, 24, 18), skin, head, 0, 0.15);
    const cap = mesh(new SphereGeometry(0.18, 20, 12, 0, TAU, 0, Math.PI * 0.52), hair, head, 0, 0.16);
    cap.rotation.x = -0.25;

    // Yüz: ana (gözler, kaşlar, ağız)
    const face = new Group();
    face.position.set(0, 0.15, 0.15);
    head.add(face);
    const eyeWhite = std(0xffffff, 0.3);
    const dark = std(0x1b1426, 0.4);
    const mouthMat = std(0x7a1f2b, 0.6);
    const eyes: Group[] = [];
    const brows: Mesh[] = [];
    for (const sx of [-1, 1]) {
      const eye = new Group();
      eye.position.set(sx * 0.065, 0.025, 0.005);
      mesh(new SphereGeometry(0.036, 14, 10), eyeWhite, eye);
      mesh(new SphereGeometry(0.019, 10, 8), dark, eye, 0, 0, 0.026);
      face.add(eye);
      eyes.push(eye);
      const brow = mesh(new BoxGeometry(0.06, 0.012, 0.012), dark, face, sx * 0.065, 0.078, 0.01);
      brows.push(brow);
    }
    const mouthOpen = mesh(new SphereGeometry(0.03, 14, 10), mouthMat, face, 0, -0.06, 0.012);
    const smileArc = mesh(new TorusGeometry(0.05, 0.007, 8, 18, Math.PI), dark, face, 0, -0.04, 0.012);

    // Kollar ve eller
    const shL = g('shL', spine, 0.29, 0.52);
    const shR = g('shR', spine, -0.29, 0.52);
    limb(shL, 0.36, 0.055, shirt);
    limb(shR, 0.36, 0.055, shirt);
    const elL = g('elL', shL, 0, -0.36);
    const elR = g('elR', shR, 0, -0.36);
    limb(elL, 0.34, 0.05, skin);
    limb(elR, 0.34, 0.05, skin);
    mesh(new SphereGeometry(0.06, 12, 10), skin, elL, 0, -0.36);
    mesh(new SphereGeometry(0.06, 12, 10), skin, elR, 0, -0.36);

    // Bacaklar ve ayakkabılar
    const hpL = g('hpL', hips, 0.11, -0.08);
    const hpR = g('hpR', hips, -0.11, -0.08);
    limb(hpL, 0.42, 0.075, pants);
    limb(hpR, 0.42, 0.075, pants);
    const knL = g('knL', hpL, 0, -0.42);
    const knR = g('knR', hpR, 0, -0.42);
    limb(knL, 0.42, 0.065, pants);
    limb(knR, 0.42, 0.065, pants);
    mesh(new BoxGeometry(0.12, 0.07, 0.22), shoe, knL, 0, -0.45, 0.05);
    mesh(new BoxGeometry(0.12, 0.07, 0.22), shoe, knR, 0, -0.45, 0.05);

    // --- Elde taşınan eşyalar (yalnızca seviye 1-2'de görünür) ---
    const propsOf = new Map<number, Group>();
    const addProp = (clip: number, parent: Group, build: (p: Group) => void) => {
      const pgp = new Group();
      pgp.position.set(0, -0.38, 0);
      parent.add(pgp);
      build(pgp);
      pgp.visible = false;
      propsOf.set(clip * 10 + (parent === elL ? 1 : 0), pgp);
    };
    const stick = (p: Group, len: number, r = 0.012, mat: Material = prop, y = 0) => mesh(new CylinderGeometry(r, r, len, 8), mat, p, 0, y - len / 2 + 0.08);
    addProp(22, elR, (p) => stick(p, 1.1, 0.011, propDark)); // olta
    addProp(23, elR, (p) => {
      const bar = mesh(new CylinderGeometry(0.014, 0.014, 0.7, 8), propDark, p, 0, 0);
      bar.rotation.z = Math.PI / 2;
      mesh(new SphereGeometry(0.09, 12, 10), propDark, p, 0.35, 0);
      mesh(new SphereGeometry(0.09, 12, 10), propDark, p, -0.35, 0);
    }); // halter
    addProp(25, elR, (p) => stick(p, 0.32, 0.012));
    addProp(25, elL, (p) => stick(p, 0.32, 0.012));
    addProp(26, elR, (p) => {
      stick(p, 0.2, 0.01, shoe);
      mesh(new BoxGeometry(0.03, 0.04, 0.02), propDark, p, 0, -0.14);
    }); // diş fırçası
    addProp(27, elR, (p) => mesh(new BoxGeometry(0.14, 0.04, 0.015), propDark, p, 0, -0.04)); // tarak
    addProp(29, elR, (p) => mesh(new BoxGeometry(0.17, 0.05, 0.1), propDark, p, 0, -0.04)); // ütü
    addProp(30, elR, (p) => {
      stick(p, 1.0, 0.012);
      mesh(new BoxGeometry(0.3, 0.05, 0.08), propDark, p, 0, -0.94);
    }); // paspas
    addProp(31, elR, (p) => mesh(new BoxGeometry(0.06, 0.12, 0.016), propDark, p, 0, -0.02)); // telefon
    addProp(35, elR, (p) => {
      stick(p, 0.7, 0.014);
      mesh(new BoxGeometry(0.04, 0.16, 0.18), propDark, p, 0, -0.64);
    }); // balta
    addProp(36, elR, (p) => {
      stick(p, 0.4, 0.013);
      mesh(new BoxGeometry(0.18, 0.07, 0.07), propDark, p, 0, -0.38);
    }); // çekiç
    addProp(37, elR, (p) => {
      stick(p, 0.8, 0.013);
      mesh(new BoxGeometry(0.16, 0.2, 0.02), propDark, p, 0, -0.85);
    }); // kürek
    addProp(38, elL, (p) => {
      const bow = mesh(new TorusGeometry(0.28, 0.01, 6, 20, Math.PI), prop, p, 0, 0);
      bow.rotation.z = -Math.PI / 2;
    }); // yay
    addProp(39, elR, (p) => mesh(new SphereGeometry(0.1, 14, 12), prop, p, 0, -0.04)); // top
    addProp(40, elR, (p) => mesh(new BoxGeometry(0.14, 0.09, 0.08), propDark, p, 0, -0.02)); // fotoğraf makinesi
    const propList = [...propsOf.entries()];

    const sil = new Color(0x161826);
    let silhouette = false;
    let curClip = -1;
    let curFace: Face = 'neutral';

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

    const setFace = (f: Face, t: number) => {
      const blink = f !== 'sleep' && t % 3.4 < 0.13;
      const eyeY =
        f === 'sleep' ? 0.08 : f === 'tired' ? 0.45 : f === 'laugh' ? 0.35 : f === 'scared' ? 1.35 : f === 'cry' ? 0.6 : blink ? 0.1 : 1;
      for (const e of eyes) e.scale.set(1, eyeY, 1);
      const browRot = f === 'scared' ? 0.35 : f === 'cry' ? -0.3 : f === 'effort' ? 0.28 : f === 'smile' || f === 'laugh' ? -0.12 : 0;
      const browUp = f === 'scared' ? 0.02 : f === 'effort' ? -0.012 : 0;
      brows[0]!.rotation.z = -browRot;
      brows[1]!.rotation.z = browRot;
      brows.forEach((b) => (b.position.y = 0.078 + browUp));
      let open = 0;
      let arc = 0; // +1 gülümseme, -1 üzgün
      switch (f) {
        case 'laugh': open = 0.55 + 0.35 * Math.abs(Math.sin(t * TAU * 2.5)); break;
        case 'cry': open = 0.35 + 0.15 * Math.sin(t * TAU * 2); arc = -1; break;
        case 'scared': open = 0.9 + 0.1 * Math.sin(t * TAU * 6); break;
        case 'sleep': open = 0.12 + 0.1 * Math.sin(t * TAU * 0.3); break;
        case 'tired': open = 0.1; arc = -0.6; break;
        case 'sneeze': open = Math.max(0, Math.sin(t * TAU * 0.5 + 1.2)) ** 3; break;
        case 'effort': open = 0.28; break;
        case 'eat': open = 0.25 + 0.45 * Math.abs(Math.sin(t * TAU * 1.25)); break;
        case 'talk': open = 0.15 + 0.5 * Math.abs(Math.sin(t * TAU * 3)); break;
        case 'smile': arc = 1; break;
        case 'focus': arc = 0.15; break;
        default: arc = 0.3;
      }
      mouthOpen.scale.set(1 + open * 0.3, 0.2 + open * 1.1, 1);
      smileArc.visible = open < 0.2 && arc !== 0;
      smileArc.rotation.z = arc >= 0 ? Math.PI : 0;
      smileArc.scale.setScalar(0.5 + Math.abs(arc) * 0.5);
      smileArc.position.y = arc >= 0 ? -0.035 : -0.075;
    };

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const a = animRef.current;
      if (!a) return;
      const t = (serverNow() - a.startedAt) / 1000;
      const level = a.level as KuklaLevel;
      const p = samplePose(a.clip, Math.max(0, t), level);
      for (const j of Object.keys(joints) as Joint[]) joints[j].rotation.set(p.rot[j][0], p.rot[j][1], p.rot[j][2]);
      root.position.set(p.pos[0], p.pos[1], p.pos[2]);

      // Siluet / renk geçişi, yüz ve eşyaların görünürlüğü
      if (p.silhouette !== silhouette || a.clip !== curClip) {
        silhouette = p.silhouette;
        for (const { mat, color } of tinted) mat.color.copy(silhouette ? sil : color);
        face.visible = !silhouette;
        for (const [key, pgp] of propList) pgp.visible = !silhouette && Math.floor(key / 10) === a.clip;
        curClip = a.clip;
        curFace = KUKLA_FACES[a.clip % KUKLA_FACES.length] ?? 'neutral';
      }
      if (!silhouette) setFace(curFace, t);

      // Gölge yükseklikle küçülür; konfeti yavaş süzülür; kamera hafifçe salınır.
      const h = Math.max(0, p.pos[1]);
      shadow.position.x = p.pos[0];
      shadow.position.z = p.pos[2];
      shadow.scale.setScalar(Math.max(0.5, 1 - h * 1.4));
      (shadow.material as MeshBasicMaterial).opacity = Math.max(0.12, 0.35 - h * 0.5);
      dust.rotation.y = t * 0.05;
      dust.position.y = Math.sin(t * 0.7) * 0.08;
      camera.position.set(Math.sin(t * 0.35) * 0.5, 1.25 + Math.sin(t * 0.5) * 0.05, 5.2);
      camera.lookAt(0, lookY, 0);
      renderer.render(scene, camera);
    };
    camera.position.set(0, 1.25, 5.2);
    camera.lookAt(0, lookY, 0);
    raf = requestAnimationFrame(frame);
    d.add(() => cancelAnimationFrame(raf));

    return () => d.dispose();
  }, []);

  return <div ref={host} className="kukla" role="img" aria-label="Kukla animasyonu" />;
}
