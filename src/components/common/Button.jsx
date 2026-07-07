export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  className = '',
  ...props
}) {
  return (
    <button type={type} className={`btn btn-${variant} btn-${size} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
