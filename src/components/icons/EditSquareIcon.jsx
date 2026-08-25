// A two-tone variant of lucide's SquarePen — the library only exposes one uniform stroke
// color per icon, but the requested reference is explicitly two-color: a dark square frame
// with a solid green pen crossing its open corner. Same two path shapes as lucide's own
// square-pen.svg (see node_modules/lucide-react/dist/esm/icons/square-pen.mjs), just given
// independent colors/fill instead of one shared currentColor stroke — the same approach
// SecureShieldIcon.jsx already uses for a two-tone trust badge.
export default function EditSquareIcon({ size = 20, frameColor = 'var(--text-strong)', penColor = 'var(--green-600)' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
        stroke={frameColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z"
        fill={penColor}
        stroke={penColor}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
