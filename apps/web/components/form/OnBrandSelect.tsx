'use client';

// Shared on-brand single-select (§8: no native <select> anywhere). A custom combobox listbox with
// the same visual language + interaction model as OnBrandMultiSelect (trigger button, popover list,
// outside-click / Escape close with focus return), but single-select. The props API is unchanged
// from the old native-<select> wrapper — it still takes `<option>` children, `value`, and an
// `onChange` given a `{ target: { value } }` event — so every existing call site upgrades for free.
// ARIA: WAI-ARIA 1.2 collapsed combobox pattern (role=combobox trigger + role=listbox/option popup,
// aria-activedescendant), keyboard: arrows, Home/End, Enter/Space, Escape, and cheap type-ahead.
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';

type Option = { value: string; label: string; disabled: boolean };

type Props = {
  id?: string;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
  'aria-label'?: string;
};

function optionText(node: ReactNode): string {
  return Children.toArray(node)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : ''))
    .join('')
    .trim();
}

function parseOptions(children: ReactNode): Option[] {
  const out: Option[] = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === 'option') {
      const p = child.props as { value?: string | number; children?: ReactNode; disabled?: boolean };
      out.push({ value: String(p.value ?? ''), label: optionText(p.children), disabled: !!p.disabled });
    }
  });
  return out;
}

export default function OnBrandSelect({
  id,
  value,
  onChange,
  children,
  className,
  style,
  disabled,
  'aria-label': ariaLabel,
}: Props) {
  const options = parseOptions(children);
  const current = value ?? '';
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const typeahead = useRef<{ buf: string; t: ReturnType<typeof setTimeout> | null }>({ buf: '', t: null });
  const listId = useId();
  const optId = (i: number) => `${listId}-opt-${i}`;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function openList() {
    if (disabled) return;
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function commit(i: number) {
    const o = options[i];
    if (!o || o.disabled) return;
    onChange?.({ target: { value: o.value } });
    setOpen(false);
    triggerRef.current?.focus();
  }
  function move(delta: number) {
    let i = active;
    for (let n = 0; n < options.length; n++) {
      i = (i + delta + options.length) % options.length;
      if (!options[i].disabled) {
        setActive(i);
        return;
      }
    }
  }
  function typeAhead(key: string) {
    if (typeahead.current.t) clearTimeout(typeahead.current.t);
    typeahead.current.buf += key.toLowerCase();
    const buf = typeahead.current.buf;
    const idx = options.findIndex((o) => !o.disabled && o.label.toLowerCase().startsWith(buf));
    if (idx >= 0) {
      if (open) setActive(idx);
      else commit(idx);
    }
    typeahead.current.t = setTimeout(() => {
      typeahead.current.buf = '';
    }, 600);
  }
  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openList();
      } else if (e.key.length === 1) {
        typeAhead(e.key);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'ArrowDown':
        e.preventDefault();
        move(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(-1);
        break;
      case 'Home':
        e.preventDefault();
        setActive(options.findIndex((o) => !o.disabled));
        break;
      case 'End':
        e.preventDefault();
        setActive(options.length - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        commit(active);
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (e.key.length === 1) typeAhead(e.key);
    }
  }

  const triggerStyle: CSSProperties = {
    width: '100%',
    border: '2px solid var(--ink)',
    borderRadius: 6,
    padding: '7px 9px',
    fontSize: 13,
    fontWeight: 700,
    background: 'var(--card)',
    color: 'var(--ink)',
    fontFamily: 'inherit',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    cursor: disabled ? 'not-allowed' : 'pointer',
    textAlign: 'left',
    ...style,
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optId(active) : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        className={['ep-select', className].filter(Boolean).join(' ')}
        onClick={() => (open ? setOpen(false) : openList())}
        style={triggerStyle}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected?.label ?? ''}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--ink2)' }}>
          ▾
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 30,
            minWidth: '100%',
            maxHeight: 320,
            overflow: 'auto',
            listStyle: 'none',
            margin: 0,
            padding: '6px 0',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            boxShadow: '3px 3px 0 var(--shadow)',
          }}
        >
          {options.map((o, i) => (
            <li
              key={o.value + i}
              id={optId(i)}
              role="option"
              aria-selected={o.value === current}
              aria-disabled={o.disabled || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(i)}
              style={{
                padding: '7px 12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: o.disabled ? 'default' : 'pointer',
                color: o.disabled ? 'var(--ink2)' : 'var(--ink)',
                background:
                  i === active ? 'var(--accent-soft)' : o.value === current ? 'var(--tone)' : 'transparent',
              }}
            >
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
