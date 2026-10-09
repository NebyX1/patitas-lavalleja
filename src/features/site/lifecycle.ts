import { initializeClientState, $motionPaused } from '../preferences/store';
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
import { initInteractions } from './interactions';
let cleanup: (() => void) | undefined;

function initPage() {
  cleanup?.();
  initializeClientState();
  const controller = new AbortController();
  const { signal } = controller;
  const header = document.getElementById('site-header');
  const progress = document.querySelector<HTMLElement>('.scroll-progress');
  let frame = 0;
  const update = () => {
    frame = 0;
    header?.classList.toggle('scrolled', window.scrollY > 12);
    const range = document.documentElement.scrollHeight - window.innerHeight;
    if (progress)
      progress.style.width = `${range > 0 ? (window.scrollY / range) * 100 : 0}%`;
  };
  const queue = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  window.addEventListener('scroll', queue, { passive: true, signal });
  window.addEventListener('resize', queue, { passive: true, signal });
  update();

  // Cards that enter together cascade: each sibling in the same batch waits a little longer than the one before it.
  const observer = new IntersectionObserver(
    (entries) => {
      const waves = new Map<Element, number>();
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const group = entry.target.parentElement ?? entry.target;
        const order = waves.get(group) ?? 0;
        waves.set(group, order + 1);
        observer.unobserve(entry.target);
        window.setTimeout(
          () => entry.target.classList.remove('pending'),
          order * 90,
        );
      });
    },
    { threshold: 0.06, rootMargin: '0px 0px -12px 0px' },
  );
  if (!$motionPaused.get()) {
    document.body.classList.add('motion-ready');
    document.querySelectorAll<HTMLElement>('.reveal').forEach((element) => {
      if (element.getBoundingClientRect().top > innerHeight * 0.94)
        element.classList.add('pending');
      observer.observe(element);
    });
  }
  initInteractions(signal);
  const onPause = () => {
    if ($motionPaused.get())
      document
        .querySelectorAll('.pending')
        .forEach((element) => element.classList.remove('pending'));
  };
  window.addEventListener('patitas:motion', onPause, { signal });
  const petLinkFrom = (event: Event) =>
    event.target instanceof Element
      ? event.target.closest<HTMLAnchorElement>('a[href^="/mascotas/"]')
      : null;
  // Only the photo selected by the visitor participates in the shared-image transition.
  document.addEventListener(
    'click',
    (event) => {
      const target = petLinkFrom(event);
      if (
        !target ||
        (event as MouseEvent).ctrlKey ||
        (event as MouseEvent).metaKey
      )
        return;
      document
        .querySelectorAll<HTMLElement>('[data-pet-photo] img')
        .forEach((image) => (image.style.viewTransitionName = 'none'));
      const image = target.querySelector<HTMLImageElement>(
        '[data-pet-photo] img',
      );
      if (image) image.style.viewTransitionName = 'pet-photo';
    },
    { capture: true, signal },
  );
  document.querySelectorAll<HTMLImageElement>('img').forEach((image) =>
    image.addEventListener(
      'error',
      () => {
        if (image.dataset.fallback) return;
        image.dataset.fallback = 'true';
        image.src = '/images/pet-placeholder.svg';
        image.removeAttribute('srcset');
      },
      { once: true, signal },
    ),
  );
  cleanup = () => {
    controller.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
    document.body.classList.remove('locked', 'motion-ready');
  };
}
document.addEventListener('astro:before-swap', (event) => {
  const swap = event as TransitionBeforeSwapEvent;
  const transition = swap.viewTransition;
  // Mobile viewport changes can cancel a native animation while the route still succeeds.
  // Handle that animation cancellation without hiding failures in the DOM update itself.
  void transition.ready.catch(() => undefined);
  if ($motionPaused.get()) transition.skipTransition();
  // Leaving a profile: the listing card for that pet receives the shared image name so the photo zooms back into it.
  // `location` already points at the destination during history navigation, so use the event's origin.
  const petPath = swap.from.pathname.match(/^\/mascotas\/[^/]+\/?$/)?.[0];
  if (petPath) {
    const card = swap.newDocument.querySelector<HTMLImageElement>(
      `a.pet-open[href="${petPath}"] [data-pet-photo] img`,
    );
    if (card) {
      card.style.viewTransitionName = 'pet-photo';
      card.loading = 'eager';
    }
  }
  cleanup?.();
});
document.addEventListener('click', (event) => {
  const back = (event.target as Element | null)?.closest<HTMLAnchorElement>(
    'a[data-profile-back]',
  );
  if (
    !back ||
    (event as MouseEvent).button !== 0 ||
    (event as MouseEvent).ctrlKey ||
    (event as MouseEvent).metaKey ||
    (event as MouseEvent).shiftKey ||
    !(history.state?.index > 0)
  )
    return;
  event.preventDefault();
  history.back();
});
document.addEventListener('astro:page-load', initPage);
