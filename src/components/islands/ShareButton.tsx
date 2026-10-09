import { useState } from 'react';
import { site, petUrl } from '../../config/site';
import { notify } from '../../features/preferences/store';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
export default function ShareButton({
  id,
  name,
}: {
  id: string;
  name: string;
}) {
  const ready = useClientState();
  const [fallback, setFallback] = useState(false);
  const url = `${site.url}${petUrl(id)}`;
  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Conocé a ${name} · Patitas Lavalleja`,
          text: 'Perfil de demostración. Un hogar lo cambia todo.',
          url,
        });
        return;
      }
      if (!navigator.clipboard) {
        setFallback(true);
        return;
      }
      await navigator.clipboard.writeText(url);
      notify('Historia copiada. Podés pegarla en un mensaje.');
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError'))
        setFallback(true);
    }
  }
  return (
    <div className="share-profile">
      <button className="text-link" disabled={!ready} onClick={share}>
        <Icon name="share" className="icon-sm" />
        Compartir esta historia
      </button>
      {fallback && (
        <label className="form-field">
          Copiá este enlace
          <input
            readOnly
            value={url}
            onFocus={(event) => event.currentTarget.select()}
          />
        </label>
      )}
    </div>
  );
}
