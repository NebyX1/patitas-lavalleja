import { clearFavorites } from '../../features/preferences/store';
import { useClientState } from '../../features/preferences/useClientState';
import Icon from '../ui/Icon';
export default function ClearFavorites() {
  useClientState();
  return (
    <button className="btn btn-outline btn-small" onClick={clearFavorites}>
      Borrar mis favoritos <Icon name="close" className="icon-sm" />
    </button>
  );
}
