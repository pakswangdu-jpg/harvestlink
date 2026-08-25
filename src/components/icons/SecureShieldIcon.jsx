// A filled variant of lucide's ShieldCheck — the library only exposes one uniform
// stroke/fill color per icon, but a "secure checkout" trust badge reads far more like a real
// trust badge (bold, green, unmistakably a shield) with the shield solid-filled and the
// checkmark cut out in white, rather than a thin single-color outline. Same two path shapes
// as lucide's own shield-check.svg, just given independent colors.
export default function SecureShieldIcon({ size = 15, color = 'var(--green-700)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" stroke="white" strokeWidth={2.5} fill="none" />
    </svg>
  );
}
