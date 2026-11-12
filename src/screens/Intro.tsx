/**
 * Açılış tanıtımı: oyun açılmadan önce ~5 sn'lik, tamamen CSS ile çalışan animasyon.
 * Logo zıplayarak düşer, dört mod uçarak gelir, spiral tahta çizilir ve ortadaki yıldıza varılır.
 * Dokununca atlanır; bir oturumda yalnızca bir kez gösterilir; "hareketi azalt" ayarında hiç çıkmaz.
 * Canvas / rAF yok, tek bir setTimeout vardır ve unmount'ta temizlenir.
 */
import { useEffect, useState } from 'react';
import { buildSpiral, starPoints, VIEW } from '../components/board/spiral';
import './intro.css';

const SEEN_KEY = 'tabu:intro-seen';
const DURATION_MS = 5600;
const MODES = [
  { icon: '🗣️', label: 'Anlat', color: 'var(--mode-anlatma)' },
  { icon: '✏️', label: 'Çiz', color: 'var(--mode-cizme)' },
  { icon: '🎭', label: 'Kukla', color: 'var(--mode-kukla)' },
  { icon: '⏱️', label: '15 Kelime', color: 'var(--mode-onbes)' },
];
const SPIRAL = buildSpiral();

function shouldPlay(): boolean {
  try {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export function Intro({ children }: { children: React.ReactNode }) {
  const [playing, setPlaying] = useState(shouldPlay);

  const finish = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* gizli mod: sorun değil */
    }
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(finish, DURATION_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  if (!playing) return <>{children}</>;
  // Alttaki ekran arkada hemen kurulur (oda bağlantısı beklemez); tanıtım üstüne biner.
  const center = SPIRAL.points[SPIRAL.points.length - 1]!;
  return (
    <>
      {children}
    <div className="intro" role="presentation" onClick={finish}>
      <svg className="intro__spiral" viewBox={`0 0 ${VIEW} ${VIEW}`} aria-hidden>
        <path className="intro__path" d={SPIRAL.path} pathLength={1} />
        <polygon className="intro__star" points={starPoints(center.x, center.y, 26, 11)} />
      </svg>
      <h1 className="intro__logo" aria-label="Tabu Party">
        {'TABU'.split('').map((c, i) => (
          <span key={i} className="intro__tabu" style={{ ['--i' as string]: i }}>
            {c}
          </span>
        ))}
        <span className="intro__party"> PARTY</span>
      </h1>
      <div className="intro__modes">
        {MODES.map((m, i) => (
          <div key={m.label} className="intro__mode" style={{ ['--i' as string]: i, ['--c' as string]: m.color }}>
            <span className="intro__icon">{m.icon}</span>
            <span>{m.label}</span>
          </div>
        ))}
      </div>
      <p className="intro__tag">Telefonlar elde, takımlar hazır. Önce yıldıza kim varacak?</p>
      <button type="button" className="intro__skip">
        Geç ›
      </button>
    </div>
    </>
  );
}
