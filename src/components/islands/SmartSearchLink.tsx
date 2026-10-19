import { useSession } from '../../features/auth/store';
import Icon from '../ui/Icon';
import '../../styles/smart-search.css';

export default function SmartSearchLink({
  variant = 'nav',
}: {
  variant?: 'nav' | 'catalog';
}) {
  const session = useSession();
  if (!session?.authenticated) return null;
  if (variant === 'catalog')
    return (
      <div className="catalog-smart-search">
        <div>
          <Icon name="spark" />
          <p>
            Tu hogar también tiene una historia. Encontrá afinidades con
            búsqueda inteligente.
          </p>
        </div>
        <a className="btn btn-outline btn-small" href="/tu-match/">
          Búsqueda inteligente <Icon name="arrow-up" />
        </a>
      </div>
    );
  return (
    <a
      className="nav-smart-search"
      href="/tu-match/"
      aria-label="Búsqueda inteligente"
      title="Búsqueda inteligente"
    >
      <Icon name="spark" /> <span>Búsqueda inteligente</span>
    </a>
  );
}
