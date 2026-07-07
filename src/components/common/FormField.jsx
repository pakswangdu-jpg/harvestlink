export default function FormField({
  label,
  name,
  error,
  helper,
  children,
}) {
  const errorId = error ? `${name}-error` : undefined;

  return (
    <label className="form-field" htmlFor={name}>
      <span>{label}</span>
      {children}
      {helper && !error ? <small>{helper}</small> : null}
      {error ? (
        <small className="field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </label>
  );
}
