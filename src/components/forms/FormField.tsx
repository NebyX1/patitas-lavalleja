import { cloneElement, useId, type ReactElement } from 'react';
export default function FormField({
  label,
  full = false,
  children,
  hint,
}: {
  label: string;
  full?: boolean;
  children: ReactElement<{ id?: string }>;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className={`form-field ${full ? 'full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
      {hint && <small>{hint}</small>}
    </div>
  );
}
