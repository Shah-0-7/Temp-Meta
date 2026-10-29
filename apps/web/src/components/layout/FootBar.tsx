/**
 * @module components/layout/FootBar
 *
 * Credit on the left, the four shortcuts that matter on the right. Hidden on
 * narrow screens, where there is no keyboard to speak of.
 */

export function FootBar() {
  return (
    <footer className="footbar">
      <span>TryAnywhere 0.1. Built for Meta&apos;s Global AI Developer Hackathon.</span>
      <div className="footbar-keys">
        <span>
          <kbd>G</kbd> Garment
        </span>
        <span>
          <kbd>V</kbd> Gallery
        </span>
        <span>
          <kbd>Space</kbd> Render photo
        </span>
        <span>
          <kbd>?</kbd> Help
        </span>
      </div>
    </footer>
  );
}
