import type { CSSProperties } from 'react';
import { useStore } from '@nanostores/react';
import type { Pet } from '../../types/pet';
import { petPhoto, petUrl } from '../../config/site';
import { $favorites, toggleFavorite } from '../../features/preferences/store';
import Icon from '../ui/Icon';

export default function PetCard({
  pet: p,
  ready,
}: {
  pet: Pet;
  ready: boolean;
}) {
  const saved = useStore($favorites, { ssr: 'initial' }).includes(p.id);
  return (
    <article
      className="pet-card"
      data-card={p.id}
      style={{ '--pos': p.pos, '--tag': p.tagColor } as CSSProperties}
    >
      <a
        className="pet-open"
        href={petUrl(p.id)}
        aria-label={`Conocer a ${p.name}, ${p.age}, ${p.location}`}
      >
        <div className="pet-photo" data-pet-photo>
          <img
            src={petPhoto(p.id, 480)}
            srcSet={`${petPhoto(p.id, 480)} 480w, ${petPhoto(p.id)} 960w`}
            sizes="(max-width: 580px) 90vw, (max-width: 1060px) 44vw, 300px"
            width="480"
            height="480"
            alt={p.alt}
            loading="lazy"
            decoding="async"
          />
          <span className="pet-badge">
            <Icon name={p.tagIcon} />
            {p.tag}
          </span>
          <span className="pet-location">
            <Icon name="pin" />
            {p.location}
          </span>
          <span className="pet-image-action" aria-hidden="true">
            <Icon name="arrow-up" />
          </span>
        </div>
        <div className="pet-info">
          <div className="pet-name-row">
            <h3>{p.name}</h3>
            <Icon name="arrow-up" />
          </div>
          <div className="pet-facts">
            <span>{p.age}</span>
            <i>·</i>
            <span>{p.size}</span>
            <i>·</i>
            <span>{p.sex}</span>
          </div>
          <p className="pet-quote">{p.quote}</p>
        </div>
      </a>
      <button
        disabled={!ready}
        className={`fav-button ${saved ? 'saved' : ''}`}
        onClick={() => toggleFavorite(p.id)}
        aria-label={`${saved ? 'Quitar a' : 'Guardar a'} ${p.name} ${saved ? 'de' : 'en'} favoritos`}
        aria-pressed={saved}
      >
        <Icon name="heart" />
      </button>
    </article>
  );
}
