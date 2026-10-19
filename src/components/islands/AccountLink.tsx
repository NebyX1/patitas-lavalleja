import { useSession } from '../../features/auth/store';
import Icon from '../ui/Icon';
import '../../styles/account-link.css';

export default function AccountLink() {
  const session = useSession();
  const user = session?.authenticated ? session.user : null;
  const label = user
    ? user.display_name.split('·')[0].trim()
    : 'Iniciar sesión';
  const description = user
    ? `Mi cuenta: ${user.display_name}`
    : 'Iniciar sesión';

  return (
    <a
      href={user ? '/cuenta/' : '/login/'}
      className={`nav-account${user ? ' is-authenticated' : ''}`}
      aria-label={description}
      title={description}
    >
      <Icon name="user" />
      <span className="nav-account-label">{label}</span>
    </a>
  );
}
