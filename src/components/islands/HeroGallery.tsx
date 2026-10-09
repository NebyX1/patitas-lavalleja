import { useState } from 'react';
import { pets } from '../../data/pets';
import { petPhoto, petUrl } from '../../config/site';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
const pairs = [
  ['milo', 'mora'],
  ['luna', 'olivia'],
  ['coco', 'pipa'],
];
export default function HeroGallery() {
  const ready = useClientState();
  const [index, setIndex] = useState(0);
  const [main, secondary] = pairs[index].map((id) =>
    pets.find((p) => p.id === id)!,
  );
  const change = (direction: number) =>
    setIndex((current) => (current + direction + pairs.length) % pairs.length);
  return (
    <div
      className="hero-art"
      aria-label="Conocé algunas de nuestras patitas"
      data-depth-scope
    >
      <div className="hero-orbit" aria-hidden="true" data-parallax="-0.12" />
      <svg
        className="hero-line"
        viewBox="0 0 180 150"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M12 137c61-11 53-40 24-35C-1 108 3 143 79 113s62-63 95-89"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeDasharray="5 7"
          strokeLinecap="round"
        />
      </svg>
      <Icon name="star" className="little-star" />
      <div className="hello-bubble" aria-live="polite" data-depth="10">
        Hola, soy {main.name} ♡
      </div>
      <div className="hero-sticker" aria-hidden="true" data-depth="16">
        <Icon name="star" className="sticker-star" />
        <div>
          <Icon name="heart" />
          Mucho amor
          <br />
          por dar.
        </div>
      </div>
      {[main, secondary].map((p, i) => (
        <a
          key={`${i}-${p.id}`}
          href={petUrl(p.id)}
          className={`polaroid ${i === 0 ? 'hero-main' : 'hero-secondary'}`}
          data-depth={i === 0 ? 8 : 14}
          aria-label={`Conocer a ${p.name}`}
        >
          <div className="polaroid-photo" data-pet-photo>
            <img
              src={petPhoto(p.id)}
              srcSet={`${petPhoto(p.id, 480)} 480w, ${petPhoto(p.id)} 960w`}
              sizes={i === 0 ? '320px' : '230px'}
              alt={p.alt}
              width="960"
              height="960"
              fetchPriority={i === 0 ? 'high' : 'auto'}
              style={{ objectPosition: p.pos }}
            />
            {i === 0 && (
              <span className="photo-caption-pill">
                <span className="dot" />
                Una historia por descubrir
              </span>
            )}
          </div>
          <div className="polaroid-caption">
            <div>
              <strong>{p.name}</strong>
              <span>
                {p.age} · {p.location}
              </span>
            </div>
            <span className="circle-button" aria-hidden="true">
              <Icon name="arrow-up" />
            </span>
          </div>
        </a>
      ))}
      <div className="hero-controls">
        <button
          disabled={!ready}
          className="circle-button"
          onClick={() => change(-1)}
          aria-label="Ver mascota anterior"
        >
          <Icon name="left" />
        </button>
        <small>0{index + 1} / 03</small>
        <div className="hero-dots" aria-hidden="true">
          {pairs.map((_, i) => (
            <i key={i} className={i === index ? 'active' : ''} />
          ))}
        </div>
        <button
          disabled={!ready}
          className="circle-button"
          onClick={() => change(1)}
          aria-label="Ver siguiente mascota"
        >
          <Icon name="right" />
        </button>
      </div>
      <div className="hero-memo" aria-hidden="true" data-depth="6">
        Tu persona favorita
        <br />
        también puede tener patas.
        <svg viewBox="0 0 50 50" fill="none">
          <path
            d="M4 43C34 47 47 26 33 4m0 0 13 8M33 4l-1 15"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  );
}
