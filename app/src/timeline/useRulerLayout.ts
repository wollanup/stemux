import { useMedia } from '../theme/palette';
import { useAudioStore } from '../hooks/useAudioStore';
import { rulerLayout } from './layout';

/** Sizes of the ruler: editable strip while the loops panel is shown */
export function useRulerLayout() {
  const editable = useAudioStore((s) => s.loopsPanelOpen);
  const coarse = useMedia('(pointer: coarse)');
  return rulerLayout(editable, coarse);
}
