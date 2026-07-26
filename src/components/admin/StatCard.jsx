// Compact KPI tile — flat, thin border, no icon tile/gradient/shadow. Same Card shell as
// everything else in this section, just sized for a single number.
export default function StatCard({ label, value, hint }) {
  return (
    <div className="rounded-lg border border-[#D0D7DE] bg-white p-4">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#57606A]">{label}</p>
      <p className="mt-1 text-[22px] font-semibold leading-none text-[#24292F]">{value}</p>
      {hint ? <p className="mt-1.5 text-[12px] text-[#57606A]">{hint}</p> : null}
    </div>
  );
}
