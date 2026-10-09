import { useStore } from '@nanostores/react';
import { $favorites, toggleFavorite } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
export default function FavoriteButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const ready = useClientState();
  const saved = useStore($favorites, { ssr: 'initial' }).includes(id);
  return (
    <button
      disabled={!ready}
      className={`fav-button ${saved ? 'saved' : ''}`}
      aria-pressed={saved}
      aria-label={`${saved ? 'Quitar a' : 'Guardar a'} ${name} ${saved ? 'de' : 'en'} favoritos`}
      onClick={() => toggleFavorite(id)}
    >
      <Icon name="heart" />
    </button>
  );
}
