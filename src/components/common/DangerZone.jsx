// Wraps destructive-only actions in a visually distinct, lightly-tinted red container so
// they never sit next to informational status badges or routine actions.
export default function DangerZone({ children }) {
  return (
    <div className="rounded-xl border border-red-100 bg-red-50/40 p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-red-700">Danger Zone</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
