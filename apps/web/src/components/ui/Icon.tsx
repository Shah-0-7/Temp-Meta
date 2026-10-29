/**
 * @module components/ui/Icon
 *
 * Small stroke icons used instead of emoji, so they match the type and take the
 * colour of the text around them. Decorative by default (aria-hidden); the button
 * that holds an icon carries the accessible name.
 */

export type IconName =
  | 'hanger'
  | 'gallery'
  | 'sliders'
  | 'help'
  | 'camera'
  | 'stop'
  | 'flip'
  | 'sparkle'
  | 'close'
  | 'link'
  | 'upload'
  | 'image'
  | 'alert'
  | 'search'
  | 'check';

const PATHS: Record<IconName, React.ReactNode> = {
  hanger: (
    <>
      <path d="M12 8.2V7.4a2.2 2.2 0 1 0-2.2-2.2" />
      <path d="M12 8.2 3.4 14.9a1.4 1.4 0 0 0 .9 2.5h15.4a1.4 1.4 0 0 0 .9-2.5L12 8.2Z" />
    </>
  ),
  gallery: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h7M17 7h3M4 17h3M13 17h7" />
      <circle cx="14" cy="7" r="2.4" />
      <circle cx="10" cy="17" r="2.4" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.2 1-1.2 1.8" />
      <path d="M12 17.1v.1" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5h3l1.4-2h7.2L17 8.5h3V19H4Z" />
      <circle cx="12" cy="13.5" r="3.3" />
    </>
  ),
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2.2" />,
  flip: (
    <>
      <path d="M4 12h16" />
      <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
    </>
  ),
  sparkle: (
    <>
      <path d="M11 3.5l1.9 5.1 5.1 1.9-5.1 1.9L11 17.5l-1.9-5.1L4 10.5l5.1-1.9Z" />
      <path d="M18.5 15.5v4M16.5 17.5h4" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  link: (
    <>
      <path d="M10.2 13.8a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M13.8 10.2a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5" />
      <path d="M5 19h14" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M4 17l4.5-4.5 3.5 3.5 3-3L20 16" />
    </>
  ),
  alert: (
    <>
      <path d="M12 4 3 19h18Z" />
      <path d="M12 10v4M12 16.6v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  check: <path d="M5 12.5 9.5 17 19 7" />,
};

export function Icon({ name, size = 20, strokeWidth = 1.8 }: { name: IconName; size?: number; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
