import { $motionPaused } from '../preferences/store';

const MAGNETIC = '.btn, .circle-button';
const DEPTH_SCOPE = '[data-depth-scope]';
const TILT = '[data-tilt]';

type Values = Record<string, number>;

const reduced = () =>
  $motionPaused.get() ||
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (value: number, limit: number) =>
  Math.max(-limit, Math.min(limit, value));

// Eases each element toward its target every frame, so pointer effects glide instead of snapping.
function createSprings(write: (element: HTMLElement, values: Values) => void) {
  const state = new Map<HTMLElement, { value: Values; target: Values }>();
  const moving = new Set<HTMLElement>();
  let frame = 0;
  const tick = () => {
    frame = 0;
    moving.forEach((element) => {
      const current = state.get(element)!;
      let settled = true;
      for (const key in current.target) {
        const gap = current.target[key] - current.value[key];
        if (Math.abs(gap) < 0.01) {
          current.value[key] = current.target[key];
        } else {
          current.value[key] += gap * 0.18;
          settled = false;
        }
      }
      write(element, current.value);
      if (settled) moving.delete(element);
    });
    if (moving.size) frame = requestAnimationFrame(tick);
  };
  return {
    aim(element: HTMLElement, target: Values) {
      const current = state.get(element);
      if (current) {
        current.target = target;
      } else {
        if (Object.values(target).every((value) => value === 0)) return;
        const value = Object.fromEntries(
          Object.keys(target).map((key) => [key, 0]),
        );
        state.set(element, { value, target });
      }
      moving.add(element);
      if (!frame) frame = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(frame);
      moving.clear();
    },
  };
}

// Splits words into spans so headings can reveal word by word. Element children such as <br> are kept.
function splitWords(heading: HTMLElement) {
  const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  let index = 0;
  texts.forEach((text) => {
    const fragment = document.createDocumentFragment();
    (text.textContent ?? '').split(/(\s+)/).forEach((part) => {
      if (!part) return;
      if (!part.trim()) {
        fragment.append(part);
        return;
      }
      const word = document.createElement('span');
      word.className = 'split-word';
      word.style.setProperty('--i', String(index++));
      word.textContent = part;
      fragment.append(word);
    });
    text.replaceWith(fragment);
  });
}

function initMotion(signal: AbortSignal) {
  const headings = document.querySelectorAll<HTMLElement>('[data-split]');
  headings.forEach((heading) => {
    if (!heading.querySelector('.split-word')) splitWords(heading);
  });
  const headingObserver = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('split-in');
        headingObserver.unobserve(entry.target);
      }),
    { threshold: 0.4 },
  );
  headings.forEach((heading) => headingObserver.observe(heading));
  signal.addEventListener('abort', () => headingObserver.disconnect());

  const layers = document.querySelectorAll<HTMLElement>('[data-parallax]');
  let frame = 0;
  const parallax = () => {
    frame = 0;
    layers.forEach((layer) => {
      const host = layer.parentElement;
      if (!host) return;
      if (reduced()) {
        layer.style.translate = '';
        return;
      }
      const rect = host.getBoundingClientRect();
      const offset =
        (rect.top + rect.height / 2 - innerHeight / 2) *
        Number(layer.dataset.parallax);
      layer.style.translate = `0 ${offset.toFixed(1)}px`;
    });
  };
  if (layers.length) {
    window.addEventListener(
      'scroll',
      () => {
        if (!frame) frame = requestAnimationFrame(parallax);
      },
      { passive: true, signal },
    );
    parallax();
    signal.addEventListener('abort', () => cancelAnimationFrame(frame));
  }

  document.addEventListener(
    'click',
    (event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('.fav-button')
          : null;
      if (!button || reduced()) return;
      button.classList.remove('pop');
      void button.offsetWidth;
      button.classList.add('pop');
      button.addEventListener('animationend', () => button.classList.remove('pop'), {
        once: true,
      });
    },
    { signal },
  );
}

function initPointer(signal: AbortSignal) {
  const offset = createSprings((element, { x, y }) => {
    element.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`;
  });
  const tilt = createSprings((element, { x, y, lift }) => {
    element.style.setProperty('--tilt-x', `${x.toFixed(2)}deg`);
    element.style.setProperty('--tilt-y', `${y.toFixed(2)}deg`);
    element.style.setProperty('--lift', `${lift.toFixed(2)}px`);
  });
  signal.addEventListener('abort', () => {
    offset.stop();
    tilt.stop();
  });

  const glow = document.createElement('div');
  glow.className = 'cursor-glow';
  glow.setAttribute('aria-hidden', 'true');
  document.body.append(glow);
  signal.addEventListener('abort', () => glow.remove());

  const targetOf = (event: Event) =>
    event.target instanceof Element ? event.target : null;

  document.addEventListener(
    'pointermove',
    (event) => {
      const target = targetOf(event);
      if (reduced()) {
        glow.classList.remove('is-on');
        return;
      }
      glow.classList.add('is-on');
      glow.style.transform = `translate3d(${event.clientX}px, ${event.clientY}px, 0)`;
      if (!target) return;

      const magnet = target.closest<HTMLButtonElement>(MAGNETIC);
      if (magnet && !magnet.disabled) {
        const rect = magnet.getBoundingClientRect();
        offset.aim(magnet, {
          x: clamp((event.clientX - rect.left - rect.width / 2) * 0.22, 9),
          y: clamp((event.clientY - rect.top - rect.height / 2) * 0.22, 9),
        });
      }

      const scope = target.closest<HTMLElement>(DEPTH_SCOPE);
      if (scope) {
        const rect = scope.getBoundingClientRect();
        const nx = clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, 1);
        const ny = clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, 1);
        scope.querySelectorAll<HTMLElement>('[data-depth]').forEach((layer) => {
          const depth = Number(layer.dataset.depth);
          offset.aim(layer, { x: nx * depth, y: ny * depth });
        });
      }

      const card = target.closest<HTMLElement>(TILT);
      if (card) {
        const rect = card.getBoundingClientRect();
        const px = event.clientX - rect.left;
        const py = event.clientY - rect.top;
        card.style.setProperty('--mx', `${px}px`);
        card.style.setProperty('--my', `${py}px`);
        tilt.aim(card, {
          x: -(py / rect.height - 0.5) * 10,
          y: (px / rect.width - 0.5) * 12,
          lift: -6,
        });
      }
    },
    { passive: true, signal },
  );

  document.addEventListener(
    'pointerout',
    (event) => {
      const target = targetOf(event);
      if (!target) return;
      const related =
        event.relatedTarget instanceof Node ? event.relatedTarget : null;

      const magnet = target.closest<HTMLElement>(MAGNETIC);
      if (magnet && !magnet.contains(related))
        offset.aim(magnet, { x: 0, y: 0 });

      const scope = target.closest<HTMLElement>(DEPTH_SCOPE);
      if (scope && !scope.contains(related))
        scope
          .querySelectorAll<HTMLElement>('[data-depth]')
          .forEach((layer) => offset.aim(layer, { x: 0, y: 0 }));

      const card = target.closest<HTMLElement>(TILT);
      if (card && !card.contains(related))
        tilt.aim(card, { x: 0, y: 0, lift: 0 });
    },
    { passive: true, signal },
  );

  document.documentElement.addEventListener(
    'pointerleave',
    () => glow.classList.remove('is-on'),
    { signal },
  );
}

export function initInteractions(signal: AbortSignal) {
  if (reduced()) return;
  initMotion(signal);
  if (matchMedia('(hover: hover) and (pointer: fine)').matches)
    initPointer(signal);
}
