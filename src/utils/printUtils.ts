/**
 * Print Utility for Bahir Dar City Administration Transport & Enforcement Documents
 * Provides reliable, cross-browser print preview trigger and cleanup.
 */

export const triggerDocumentPrint = (targetType: 'a4' | 'sticker' | 'id-card' = 'a4') => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  // Set print target on body to activate print isolation styles in index.css
  document.body.setAttribute('data-print-target', targetType);
  document.body.classList.add('is-printing-doc');

  const cleanup = () => {
    document.body.removeAttribute('data-print-target');
    document.body.classList.remove('is-printing-doc');
    window.removeEventListener('afterprint', cleanup);
  };

  // Modern browsers fire afterprint when dialog is closed or print starts
  window.addEventListener('afterprint', cleanup);

  // Focus and trigger window.print with a small delay for styling and DOM rendering
  window.focus();
  setTimeout(() => {
    try {
      window.print();
    } catch (err) {
      console.error('Print trigger failed:', err);
    }
    // Fallback safety timeout in case afterprint does not fire in some iframe environments
    setTimeout(cleanup, 2500);
  }, 120);
};
