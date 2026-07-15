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
  // Opt-in text filter for long lists (e.g. countries). Default keeps the exact old behavior.
  searchable?: boolean;
  searchPlaceholder?: string;
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
  searchable = false,
  searchPlaceholder,
}: Props) {
  const options = parseOptions(children);
  const current = value ?? '';
  const selectedIndex = options.findIndex((o) => o.value === current);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(selectedIndex >= 0 ? selectedIndex : 0);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const typeahead = useRef<{ buf: string; t: ReturnType<typeof setTimeout> | null }>({ buf: '', t: null });
  const listId = useId();
  const optId = (i: number) => `${listId}-opt-${i}`;

  // The list navigation/commit operate over the filtered view when searchable.
  const q = query.trim().toLowerCase();
  const list = searchable && q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Reset the query and focus the filter box each time the popover opens.
  useEffect(() => {
    if (!open) {
      setQuery('');
    } else if (searchable) {
      searchRef.current?.focus();
    }
  }, [open, searchable]);

  function openList() {
    if (disabled) return;
    const i = list.findIndex((o) => o.value === current);
    setActive(i >= 0 ? i : list.findIndex((o) => !o.disabled));
    setOpen(true);
  }
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }
  function commit(i: number) {
    const o = list[i];
    if (!o || o.disabled) return;
    onChange?.({ target: { value: o.value } });
    setOpen(false);
    triggerRef.current?.focus();
  }
  function move(delta: number) {
    if (list.length === 0) return;
    let i = active;
    for (let n = 0; n < list.length; n++) {
      i = (i + delta + list.length) % list.length;
      if (!list[i].disabled) {
        setActive(i);
        return;
      }
    }
  }
  function onSearch(next: string) {
    setQuery(next);
    // Keep the active option valid within the new filtered view.
    const nq = next.trim().toLowerCase();
    const nextList = nq ? options.filter((o) => o.label.toLowerCase().includes(nq)) : options;
    setActive(nextList.findIndex((o) => !o.disabled));
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
      } else if (!searchable && e.key.length === 1) {
        typeAhead(e.key);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':
        // Popover is open here: consume the Escape so it closes ONLY the listbox and never bubbles
        // to a surrounding modal (which would close it and discard edits). A closed-popover Escape
        // is left alone above (early return) so it can still close a parent modal.
        e.preventDefault();
        e.stopPropagation();
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
        setActive(list.findIndex((o) => !o.disabled));
        break;
      case 'End':
        e.preventDefault();
        setActive(list.length - 1);
        break;
      case 'Enter':
        e.preventDefault();
        commit(active);
        break;
      case ' ':
        // In searchable mode Space types into the filter box; only commit for plain selects.
        if (!searchable) {
          e.preventDefault();
          commit(active);
        }
        break;
      case 'Tab':
        setOpen(false);
        break;
      default:
        if (!searchable && e.key.length === 1) typeAhead(e.key);
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
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            // CS-5 Fb-3 — clear sibling surface panels + the Comptoir widget (z 40); modals sit at 70–95.
            zIndex: 60,
            minWidth: '100%',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 6,
            boxShadow: '3px 3px 0 var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {searchable && (
            <div style={{ padding: 6, borderBottom: '2px solid var(--ink)' }}>
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => onSearch(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                aria-controls={listId}
                autoComplete="off"
                style={{
                  width: '100%',
                  minHeight: 44,
                  boxSizing: 'border-box',
                  border: '2px solid var(--ink)',
                  borderRadius: 6,
                  padding: '7px 9px',
                  fontSize: 13,
                  fontWeight: 700,
                  fontFamily: 'inherit',
                  background: 'var(--card)',
                  color: 'var(--ink)',
                }}
              />
            </div>
          )}
          <ul
            id={listId}
            role="listbox"
            aria-label={ariaLabel}
            style={{
              maxHeight: 320,
              overflow: 'auto',
              listStyle: 'none',
              margin: 0,
              padding: '6px 0',
            }}
          >
            {list.length === 0 ? (
              <li aria-disabled="true" style={{ padding: '7px 12px', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
                Aucun résultat
              </li>
            ) : (
              list.map((o, i) => (
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
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
