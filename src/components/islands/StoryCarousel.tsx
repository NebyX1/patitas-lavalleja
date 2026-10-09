import { useState } from 'react';
import { stories } from '../../data/stories';
import { petPhoto } from '../../config/site';
import Icon from '../ui/Icon';
import { useClientState } from '../../features/preferences/useClientState';
export default function StoryCarousel() {
  const ready = useClientState();
  const [index, setIndex] = useState(0);
  const story = stories[index];
  return (
    <div className="story-shell">
      <div className="story-image">
        <img
          key={story.image}
          src={petPhoto(story.image)}
          width="960"
          height="960"
          alt={story.alt}
          loading="lazy"
        />
        <span className="story-image-label">{story.label}</span>
      </div>
      <div className="story-copy">
        <Icon name="star" className="story-star" />
        <div className="eyebrow">
          <span className="dot" />
          Historias que nos gustaría ver pasar
        </div>
        <div className="story-content" key={index} aria-live="polite">
          <h2 id="story-title">
            {story.title[0]}
            <br />
            {story.title[1]}
            <br />
            <span>{story.title[2]}</span>
          </h2>
          <p>{story.text}</p>
        </div>
        <div className="story-end">
          <small>0{index + 1} / 03 · Historia ilustrativa</small>
          <div className="story-nav">
            <button
              disabled={!ready}
              className="circle-button"
              onClick={() => setIndex((index + 2) % 3)}
              aria-label="Historia anterior"
            >
              <Icon name="left" />
            </button>
            <button
              disabled={!ready}
              className="circle-button"
              onClick={() => setIndex((index + 1) % 3)}
              aria-label="Siguiente historia"
            >
              <Icon name="right" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
