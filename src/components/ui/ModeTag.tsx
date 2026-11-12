import type { StepKind } from '@shared/types';
import { MODE_CONFIG } from '@shared/board';

const LABELS: Record<StepKind, string> = {
  anlatma: MODE_CONFIG.anlatma.label,
  cizme: MODE_CONFIG.cizme.label,
  kukla: MODE_CONFIG.kukla.label,
  onbes: MODE_CONFIG.onbes.label,
  karisik: 'Karışık',
};

export function ModeTag({ kind }: { kind: StepKind }) {
  return <span className={`mode-tag mode-tag--${kind}`}>{LABELS[kind]}</span>;
}
