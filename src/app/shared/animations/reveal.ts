/**
 * Zero-dependency scroll-reveal + count-up engine for the Angular SPA.
 * Uses IntersectionObserver (with a MutationObserver fallback for SPA route
 * changes) so animations work app-wide without per-component imports.
 *
 * Usage in templates:
 *   <div data-reveal>...</div>
 *   <div data-reveal="left" [attr.data-reveal-delay]="i*80">...</div>
 *   <span data-count-to="10000" data-count-suffix="+">0</span>
 */

let started = false;

export function initScrollReveal(): void {
  if (started) return;
  started = true;

  const root = document.documentElement;
  root.classList.add('reveal-enabled');

  // Graceful fallback: no IntersectionObserver -> show everything.
  if (!('IntersectionObserver' in window)) {
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach(el => el.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target as HTMLElement;
      const delay = el.getAttribute('data-reveal-delay');
      if (delay) el.style.transitionDelay = `${delay}ms`;
      el.classList.add('is-visible');

      const countTo = el.getAttribute('data-count-to');
      if (countTo !== null) animateCount(el);

      observer.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  const observeAll = () => {
    document.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-visible)').forEach(el => observer.observe(el));
  };

  observeAll();

  // Re-scan whenever the DOM changes (route navigations, dynamic lists).
  const mo = new MutationObserver(() => observeAll());
  mo.observe(document.body, { childList: true, subtree: true });
}

function animateCount(el: HTMLElement): void {
  const target = parseFloat(el.getAttribute('data-count-to') || '0');
  const duration = parseInt(el.getAttribute('data-count-duration') || '1600', 10);
  const prefix = el.getAttribute('data-count-prefix') || '';
  const suffix = el.getAttribute('data-count-suffix') || '';
  const decimals = parseInt(el.getAttribute('data-count-decimals') || '0', 10);
  const separator = el.getAttribute('data-count-separator') === 'true';

  const format = (val: number): string => {
    let s = val.toFixed(decimals);
    if (separator) {
      const parts = s.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = parts.join('.');
    }
    return prefix + s + suffix;
  };

  const start = performance.now();
  const step = (now: number) => {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
    el.textContent = format(target * eased);
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = format(target);
  };
  requestAnimationFrame(step);
}
