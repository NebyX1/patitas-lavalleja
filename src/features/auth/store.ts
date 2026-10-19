import { useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $session, getSession } from '../../lib/api';
export {
  $session,
  getSession,
  setSession,
  login,
  register,
  logout,
} from '../../lib/api';
export type { Session, User } from '../../lib/api';
export function useSession() {
  const session = useStore($session, { ssr: 'initial' });
  useEffect(() => {
    void getSession().catch(() => {});
  }, []);
  return session;
}
