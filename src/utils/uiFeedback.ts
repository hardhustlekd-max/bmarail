/**
 * Municipal Fleet & Motorcycle Management System
 * Universal UI Visual Feedback & Interactive Transitions Engine
 * 
 * Provides instant, tactile micro-feedback (ripple waves, active scale,
 * and smooth transitions) for all buttons, links, tabs, and interactive elements.
 */

let isInitialized = false;

export function initUiFeedback(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Listen globally to pointerdown for instant tactile response
  window.addEventListener(
    'pointerdown',
    (e: PointerEvent) => {
      // Only respond to primary clicks (left click or touch)
      if (e.button !== 0 && e.pointerType === 'mouse') return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Find the nearest interactive element
      const interactiveEl = target.closest<HTMLElement>(
        'button, [role="button"], a, input[type="submit"], input[type="button"], input[type="reset"], .clickable, .tab-btn'
      );

      if (!interactiveEl) return;

      // Ignore disabled or non-interactive elements
      if (
        interactiveEl.hasAttribute('disabled') ||
        interactiveEl.getAttribute('aria-disabled') === 'true' ||
        interactiveEl.classList.contains('disabled') ||
        interactiveEl.classList.contains('cursor-default') ||
        interactiveEl.classList.contains('cursor-not-allowed') ||
        interactiveEl.classList.contains('no-ripple')
      ) {
        return;
      }

      // Check for user reduced motion preference
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      createRipple(e, interactiveEl);
    },
    { passive: true }
  );
}

function createRipple(e: PointerEvent, container: HTMLElement): void {
  const rect = container.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  // Ensure container has position and overflow hidden for the ripple effect
  const computedStyle = window.getComputedStyle(container);
  const originalPosition = computedStyle.position;
  const originalOverflow = computedStyle.overflow;

  if (originalPosition === 'static') {
    container.style.position = 'relative';
  }
  if (originalOverflow === 'visible' && !container.classList.contains('allow-overflow')) {
    container.style.overflow = 'hidden';
  }

  // Calculate coordinates relative to container
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const size = Math.max(rect.width, rect.height) * 2.2;

  const ripple = document.createElement('span');
  ripple.className = 'app-click-ripple';
  ripple.style.width = `${size}px`;
  ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  // Choose ink color based on background luminance or text color
  const isDarkContainer =
    container.classList.contains('bg-primary') ||
    container.classList.contains('bg-[#0B1E48]') ||
    container.classList.contains('bg-[#1D61E7]') ||
    container.classList.contains('bg-blue-600') ||
    container.classList.contains('bg-blue-700') ||
    container.classList.contains('bg-emerald-600') ||
    container.classList.contains('bg-emerald-700') ||
    container.classList.contains('bg-red-600') ||
    container.classList.contains('bg-red-700') ||
    container.classList.contains('bg-rose-600') ||
    container.classList.contains('text-white') ||
    document.documentElement.classList.contains('dark');

  if (isDarkContainer) {
    ripple.style.backgroundColor = 'rgba(255, 255, 255, 0.28)';
  } else {
    ripple.style.backgroundColor = 'rgba(11, 30, 72, 0.16)';
  }

  container.appendChild(ripple);

  // Clean up after ripple animation completes
  const removeRipple = () => {
    if (ripple.parentNode === container) {
      container.removeChild(ripple);
    }
  };

  ripple.addEventListener('animationend', removeRipple, { once: true });
  setTimeout(removeRipple, 420);
}
