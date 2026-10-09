import { useStore } from '@nanostores/react';
import { $feedback } from '../../features/preferences/store';
import Icon from '../ui/Icon';
export default function Toast() {
  const message = useStore($feedback, { ssr: 'initial' });
  return (
    <div
      className="toast-stack"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {message && (
        <div className="toast">
          <Icon name="check" />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
