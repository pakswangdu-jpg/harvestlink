




export default function DeliveryTruckIcon({ size = 16, strokeWidth = 2, className = '' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 8h1" />
      <path d="M1.5 12h2" />
      <path d="M2 16h1" />
      <path d="M14 18V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h1" />
      <path d="M4 11h10" />
      <path d="M15 18H9" />
      <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14v10" />
      <circle cx="17" cy="18" r="2" />
      <circle cx="7" cy="18" r="2" />
    </svg>
  );
}
