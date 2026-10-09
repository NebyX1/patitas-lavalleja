import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent,
} from 'react';
import Icon from './Icon';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  id?: string;
  label: string;
  value: T;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  variant?: 'pill' | 'field' | 'inline' | 'form';
  icon?: string;
  align?: 'start' | 'end';
  className?: string;
  name?: string;
  required?: boolean;
}

export default function SelectMenu<T extends string>({
  id: idProp,
  label,
  value,
  options,
  onChange,
  variant = 'field',
  icon,
  align = 'start',
  className = '',
  name,
  required = false,
}: Props<T>) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  useEffect(() => {
    if (!open) return;
    items.current[selected]?.focus({ preventScroll: true });
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePress);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePress);
  }, [open, selected]);

  const choose = (next: T) => {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
      return;
    }
    if (!open) return;
    const list = items.current;
    const index = list.indexOf(document.activeElement as HTMLLIElement);
    const last = list.length - 1;
    let target = -1;
    if (event.key === 'ArrowDown') target = index < last ? index + 1 : 0;
    else if (event.key === 'ArrowUp') target = index > 0 ? index - 1 : last;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = last;
    if (target < 0) return;
    event.preventDefault();
    list[target]?.focus();
  };

  const onBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  const current = options[selected];
  const listId = `${id}-list`;

  return (
    <div
      ref={root}
      className={[
        'select-menu',
        `select-${variant}`,
        align === 'end' ? 'align-end' : '',
        open ? 'open' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <button
        ref={trigger}
        id={id}
        type="button"
        className="select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((isOpen) => !isOpen)}
        onKeyDown={(event) => {
          if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon && <Icon name={icon} className="select-icon" />}
        <span
          id={`${id}-label`}
          className={variant === 'field' ? 'select-caption' : 'select-caption sr-only'}
        >
          {label}
        </span>
        <span id={`${id}-value`} className="select-value">
          {current?.label}
        </span>
        <Icon name="down" className="select-chevron" />
      </button>
      <ul
        id={listId}
        role="listbox"
        aria-labelledby={`${id}-label`}
        className="select-list"
      >
        {options.map((option, i) => {
          const isSelected = option.value === value;
          return (
            <li
              key={option.value}
              ref={(node) => {
                items.current[i] = node;
              }}
              role="option"
              aria-selected={isSelected}
              tabIndex={-1}
              className="select-option"
              style={{ '--i': i } as CSSProperties}
              onClick={() => choose(option.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  choose(option.value);
                }
              }}
            >
              <span>{option.label}</span>
              <Icon name="check" className="select-check" />
            </li>
          );
        })}
      </ul>
      {/* Native validation focuses this hidden select; forward that focus to the visible trigger. */}
      {name && (
        <select
          className="sr-only"
          name={name}
          required={required}
          value={value}
          onChange={() => {}}
          onFocus={() => trigger.current?.focus()}
          tabIndex={-1}
          aria-hidden="true"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
