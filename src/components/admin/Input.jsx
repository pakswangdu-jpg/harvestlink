export default function Input({ className = '', ...props }) {
  return (
    <input
      className={`h-9 w-full rounded-md border border-[#D0D7DE] bg-white px-3 text-[13px] text-[#24292F] outline-none transition-shadow duration-150 placeholder:text-[#57606A] focus:border-[#166534] focus:ring-2 focus:ring-[#16653433] ${className}`.trim()}
      {...props}
    />
  );
}
