import { initializeClientState, $motionPaused } from '../preferences/store';
import type { TransitionBeforeSwapEvent } from 'astro:transitions/client';
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

  const observer = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('pending');
          observer.unobserve(entry.target);
        }
      }),
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
  const onPause = () => {
    if ($motionPaused.get())
      document
        .querySelectorAll('.pending')
        .forEach((element) => element.classList.remove('pending'));
  };
  window.addEventListener('patitas:motion', onPause, { signal });
  // Only the photo selected by the visitor participates in the shared-image transition.
  document.addEventListener(
    'click',
    (event) => {
      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>('a[href^="/mascotas/"]')
          : null;
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
  const transition = (event as TransitionBeforeSwapEvent).viewTransition;
  // Mobile viewport changes can cancel a native animation while the route still succeeds.
  // Handle that animation cancellation without hiding failures in the DOM update itself.
  void transition.ready.catch(() => undefined);
  if ($motionPaused.get()) transition.skipTransition();
  cleanup?.();
});
document.addEventListener('astro:page-load', initPage);
