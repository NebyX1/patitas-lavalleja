import { useStore } from '@nanostores/react';
import { $theme, toggleTheme } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
export default function ThemeToggle() {
  const ready = useClientState();
  const theme = useStore($theme, { ssr: 'initial' });
  return (
    <button
      className="circle-button theme-toggle"
      disabled={!ready}
      onClick={toggleTheme}
      aria-label={
        theme === 'dark' ? 'Activar modo diurno' : 'Activar modo nocturno'
      }
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Volver al día' : 'Encender la noche'}
    >
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
