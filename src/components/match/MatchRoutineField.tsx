import { useId } from 'react';

export default function MatchRoutineField({
  label,
  value,
  max,
  hours,
  onChange,
}: {
  label: string;
  value: number | null;
  max: number;
  hours: boolean;
  onChange: (value: number | null) => void;
}) {
  const id = useId();
  return (
    <div className="match-routine-field">
      <div className="form-field">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          aria-describedby={`${id}-help`}
          type="number"
          min="0"
          max={max}
          step={hours ? '0.5' : '1'}
          value={value ?? ''}
          onChange={(event) =>
            onChange(
              event.target.value === ''
                ? null
                : Math.max(
                    0,
                    Math.min(
                      max,
                      hours
                        ? Number(event.target.value)
                        : Math.round(Number(event.target.value)),
                    ),
                  ),
            )
          }
          placeholder="No lo sé todavía"
        />
        <small id={`${id}-help`}>
          Podés dejarlo vacío si todavía necesitás confirmarlo.
        </small>
      </div>
      <div
        className="match-quick-values"
        role="group"
        aria-label={
          hours
            ? 'Horas fuera de casa: valores sugeridos'
            : 'Tiempo de actividad: valores sugeridos'
        }
      >
        {(hours ? [0, 4, 8] : [30, 60, 120]).map((amount) => (
          <button
            key={amount}
            type="button"
            aria-pressed={value === amount}
            onClick={() => onChange(amount)}
          >
            {amount} {hours ? 'horas' : 'minutos'}
          </button>
        ))}
      </div>
    </div>
  );
}
