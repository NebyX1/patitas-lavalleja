import { useStore } from '@nanostores/react';
import { $motionPaused, toggleMotion } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
export default function MotionToggle() {
  const ready = useClientState();
  const paused = useStore($motionPaused, { ssr: 'initial' });
  return (
    <button
      className="motion-button"
      disabled={!ready}
      onClick={toggleMotion}
      aria-pressed={paused}
      aria-label={paused ? 'Activar movimiento' : 'Pausar movimiento'}
    >
      <Icon name={paused ? 'play' : 'pause'} />
      <span>Movimiento: {paused ? 'pausado' : 'activo'}</span>
    </button>
  );
}
