

export default function DangerZone({ children }) {
  return (
    <div className="rounded-lg border border-red-100 bg-red-50/40 p-5">
      <p className="text-[13px] font-semibold uppercase tracking-wide text-red-700">Danger Zone</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}
