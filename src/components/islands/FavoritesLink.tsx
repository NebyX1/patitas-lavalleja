import { useStore } from '@nanostores/react';
import { $favorites } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
export default function FavoritesLink() {
  useClientState();
  const favorites = useStore($favorites, { ssr: 'initial' });
  return (
    <a
      href="/favoritos/"
      className="circle-button nav-fav"
      aria-label={`Ver mis favoritos${favorites.length ? ` (${favorites.length})` : ''}`}
    >
      <Icon name="heart" />
      {favorites.length > 0 && (
        <span className="fav-count">{favorites.length}</span>
      )}
    </a>
  );
}
