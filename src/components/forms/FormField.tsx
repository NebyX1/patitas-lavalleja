import { cloneElement, useId, type ReactElement } from 'react';
export default function FormField({
  label,
  full = false,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactElement<{ id?: string }>;
}) {
  const id = useId();
  return (
    <div className={`form-field ${full ? 'full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {cloneElement(children, { id })}
    </div>
  );
}
