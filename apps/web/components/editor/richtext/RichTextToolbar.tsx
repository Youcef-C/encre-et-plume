'use client';

// CS-4 / AD-8 — the shared formatting toolbar. Full control set (iter 2): Style ▾ (Paragraphe /
// Titre 1-3), B / I / U / S, Couleur ▾, Surligner ▾, Alignement ▾, • Liste / 1. Liste / Citation,
// Lien ▾, Effacer la mise en forme, Annuler / Rétablir. French aria-labels + aria-pressed active
// state on every control. A right-hand `slot` lets CS-4 inject "Ouvrir un fichier ▾" + "＋ Commentaire".
// Reads capabilities off the editor (isActive/can) so AD-8 (non-collab) mounts it unchanged.
import { useEffect, useId, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { COLLAB_COLORS } from '@encre-et-plume/shared';
import { HEADING_LEVELS, HIGHLIGHT_DEFAULT } from './core';
import {
  StrikeIcon,
  QuoteIcon,
  LinkIcon,
  LinkOffIcon,
  UndoIcon,
  RedoIcon,
  HighlightIcon,
  ListBulletIcon,
  ListOrderedIcon,
  PaletteIcon,
  ClearFormatIcon,
  AlignLeftIcon,
  CheckIcon,
} from '../../icons';

const ALIGNS = ['left', 'center', 'right'] as const;
type Align = (typeof ALIGNS)[number];
const ALIGN_LABELS: Record<Align, string> = { left: 'Gauche', center: 'Centre', right: 'Droite' };

// Text-colour swatches: ink, accent, the caret colours (deduped — accent is also a caret colour).
const TEXT_COLORS = Array.from(new Set(['#16130f', '#e8261c', ...COLLAB_COLORS]));
// Highlight swatches (default first).
const HIGHLIGHT_COLORS = [HIGHLIGHT_DEFAULT, '#b6e3a7', '#ffb3c1', '#a7d8ff', '#e0c3fc'] as const;

const btn: React.CSSProperties = {
  minWidth: 32,
  height: 32,
  padding: '0 8px',
  border: 'none',
  background: 'transparent',
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--ink2)',
  cursor: 'pointer',
  borderRadius: 5,
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
};
const activeBtn: React.CSSProperties = { ...btn, background: 'var(--accent-soft)', color: 'var(--ink)' };
const sep: React.CSSProperties = { width: 1, alignSelf: 'stretch', margin: '2px 3px', background: 'var(--border)' };

export interface RichTextToolbarProps {
  editor: Editor | null;
  disabled?: boolean;
  /** Right-aligned extra controls (CS-4: file dropdown + comment). */
  slot?: React.ReactNode;
}

export default function RichTextToolbar({ editor, disabled, slot }: RichTextToolbarProps) {
  // Re-render on selection/transaction so active states track the caret.
  const [, force] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => force((n) => n + 1);
    editor.on('transaction', rerender);
    editor.on('selectionUpdate', rerender);
    return () => {
      editor.off('transaction', rerender);
      editor.off('selectionUpdate', rerender);
    };
  }, [editor]);

  const ready = !!editor && !disabled;

  return (
    <div
      role="toolbar"
      aria-label="Mise en forme"
      className="ep-rt-toolbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '7px 14px',
        borderBottom: '2px solid var(--border)',
        flexWrap: 'wrap',
      }}
    >
      <StyleMenu editor={editor} disabled={!ready} />
      <span aria-hidden="true" style={sep} />
      <ToolButton label="Gras" pressed={!!editor?.isActive('bold')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBold().run()}>
        B
      </ToolButton>
      <ToolButton label="Italique" pressed={!!editor?.isActive('italic')} disabled={!ready} onClick={() => editor?.chain().focus().toggleItalic().run()}>
        <span style={{ fontStyle: 'italic' }}>I</span>
      </ToolButton>
      <ToolButton label="Souligné" pressed={!!editor?.isActive('underline')} disabled={!ready} onClick={() => editor?.chain().focus().toggleUnderline().run()}>
        <span style={{ textDecoration: 'underline' }}>U</span>
      </ToolButton>
      <ToolButton label="Barré" pressed={!!editor?.isActive('strike')} disabled={!ready} onClick={() => editor?.chain().focus().toggleStrike().run()}>
        <StrikeIcon size={16} />
      </ToolButton>
      <span aria-hidden="true" style={sep} />
      <ColorMenu editor={editor} disabled={!ready} />
      <HighlightMenu editor={editor} disabled={!ready} />
      <AlignMenu editor={editor} disabled={!ready} />
      <span aria-hidden="true" style={sep} />
      <ToolButton label="Liste à puces" pressed={!!editor?.isActive('bulletList')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
        <ListBulletIcon size={16} />
      </ToolButton>
      <ToolButton label="Liste numérotée" pressed={!!editor?.isActive('orderedList')} disabled={!ready} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
        <ListOrderedIcon size={16} />
      </ToolButton>
      <ToolButton label="Citation" pressed={!!editor?.isActive('blockquote')} disabled={!ready} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
        <QuoteIcon size={16} />
      </ToolButton>
      <LinkMenu editor={editor} disabled={!ready} />
      <ToolButton label="Effacer la mise en forme" pressed={false} disabled={!ready} onClick={() => clearFormatting(editor)}>
        <ClearFormatIcon size={16} />
      </ToolButton>
      <span aria-hidden="true" style={sep} />
      <ToolButton label="Annuler" pressed={false} disabled={!ready} onClick={() => editor?.chain().focus().undo().run()}>
        <UndoIcon size={16} />
      </ToolButton>
      <ToolButton label="Rétablir" pressed={false} disabled={!ready} onClick={() => editor?.chain().focus().redo().run()}>
        <RedoIcon size={16} />
      </ToolButton>
      {slot != null && <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10 }}>{slot}</span>}
    </div>
  );
}

// D13 — marks + colour/highlight reset + setParagraph (NEVER clearNodes, which would lift the
// planche/case structure).
function clearFormatting(editor: Editor | null) {
  if (!editor) return;
  editor.chain().focus().unsetAllMarks().unsetColor().unsetHighlight().setParagraph().run();
}

function ToolButton({
  label,
  pressed,
  disabled,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      style={pressed ? activeBtn : btn}
    >
      {children}
    </button>
  );
}

// A small popover wrapper: on-brand card, closes on outside pointerdown + Escape.
function Popover({
  triggerLabel,
  triggerContent,
  active,
  disabled,
  ariaKind = 'menu',
  children,
  width,
}: {
  triggerLabel: string;
  triggerContent: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  ariaKind?: 'menu' | 'listbox' | 'dialog';
  children: (close: () => void) => React.ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label={triggerLabel}
        title={triggerLabel}
        aria-haspopup={ariaKind}
        aria-expanded={open}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={active ? activeBtn : btn}
      >
        {triggerContent}
      </button>
      {open && (
        <div
          role={ariaKind === 'listbox' ? undefined : ariaKind}
          aria-label={triggerLabel}
          style={{
            position: 'absolute',
            top: 36,
            left: 0,
            zIndex: 25,
            minWidth: width ?? 160,
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '5px 5px 0 var(--shadow)',
            overflow: 'hidden',
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

// "Style ▾" — a keyboard-operable popover listbox: Paragraphe / Titre 1 / Titre 2 / Titre 3.
function StyleMenu({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const isTitre = HEADING_LEVELS.find((l) => editor?.isActive('heading', { level: l }));
  const current = isTitre ? `Titre ${isTitre}` : 'Paragraphe';
  return (
    <Popover triggerLabel="Style ▾" triggerContent={<>Style ▾</>} ariaKind="listbox" active={!!isTitre} disabled={disabled} width={150}>
      {(close) => (
        <ul role="listbox" aria-label="Style de texte" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          <StyleOption
            selected={current === 'Paragraphe'}
            onClick={() => {
              editor?.chain().focus().setParagraph().run();
              close();
            }}
          >
            Paragraphe
          </StyleOption>
          {HEADING_LEVELS.map((level) => (
            <StyleOption
              key={level}
              selected={current === `Titre ${level}`}
              onClick={() => {
                editor?.chain().focus().setHeading({ level }).run();
                close();
              }}
            >
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 20 - level * 2 + 6 }}>Titre {level}</span>
            </StyleOption>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function StyleOption({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <li role="presentation">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        onClick={onClick}
        style={{
          display: 'flex',
          width: '100%',
          alignItems: 'center',
          gap: 8,
          padding: '9px 12px',
          minHeight: 40,
          border: 'none',
          background: selected ? 'var(--accent-soft)' : 'transparent',
          fontFamily: 'inherit',
          fontSize: 13,
          fontWeight: 500,
          color: 'var(--ink)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {selected && <CheckIcon size={13} />}
        <span>{children}</span>
      </button>
    </li>
  );
}

function ColorMenu({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const active = !!editor?.isActive('textStyle');
  return (
    <Popover triggerLabel="Couleur du texte" triggerContent={<><PaletteIcon size={16} /> ▾</>} active={active} disabled={disabled} width={180}>
      {(close) => (
        <div style={{ padding: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Couleur ${c}`}
                title={c}
                onClick={() => {
                  editor?.chain().focus().setColor(c).run();
                  close();
                }}
                style={{ width: 26, height: 26, borderRadius: 6, border: '2px solid var(--ink)', background: c, cursor: 'pointer' }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              editor?.chain().focus().unsetColor().run();
              close();
            }}
            style={{ marginTop: 9, width: '100%', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 700, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
          >
            Par défaut
          </button>
        </div>
      )}
    </Popover>
  );
}

function HighlightMenu({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const active = !!editor?.isActive('highlight');
  return (
    <Popover triggerLabel="Surligner" triggerContent={<><HighlightIcon size={16} /> ▾</>} active={active} disabled={disabled} width={180}>
      {(close) => (
        <div style={{ padding: 10 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {HIGHLIGHT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Surligner en ${c}`}
                title={c}
                onClick={() => {
                  editor?.chain().focus().toggleHighlight({ color: c }).run();
                  close();
                }}
                style={{ width: 26, height: 26, borderRadius: 6, border: '2px solid var(--ink)', background: c, cursor: 'pointer' }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              editor?.chain().focus().unsetHighlight().run();
              close();
            }}
            style={{ marginTop: 9, width: '100%', border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 700, background: 'var(--card)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink)' }}
          >
            Aucun surlignage
          </button>
        </div>
      )}
    </Popover>
  );
}

function AlignMenu({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const current: Align = (ALIGNS.find((a) => editor?.isActive({ textAlign: a })) as Align) ?? 'left';
  return (
    <Popover triggerLabel="Alignement" triggerContent={<><AlignLeftIcon size={16} /> ▾</>} ariaKind="listbox" active={current !== 'left'} disabled={disabled} width={150}>
      {(close) => (
        <ul role="listbox" aria-label="Alignement du texte" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {ALIGNS.map((a) => (
            <StyleOption
              key={a}
              selected={current === a}
              onClick={() => {
                editor?.chain().focus().setTextAlign(a).run();
                close();
              }}
            >
              {ALIGN_LABELS[a]}
            </StyleOption>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function LinkMenu({ editor, disabled }: { editor: Editor | null; disabled?: boolean }) {
  const active = !!editor?.isActive('link');
  const inputId = useId();
  const [url, setUrl] = useState('');
  return (
    <Popover triggerLabel="Lien" triggerContent={<LinkIcon size={16} />} ariaKind="dialog" active={active} disabled={disabled} width={220}>
      {(close) => (
        <form
          style={{ padding: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const href = url.trim();
            if (href) editor?.chain().focus().extendMarkRange('link').setLink({ href }).run();
            setUrl('');
            close();
          }}
        >
          <label htmlFor={inputId} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
            Adresse du lien
          </label>
          <input
            id={inputId}
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            style={{ width: '100%', marginTop: 4, border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 8px', fontSize: 12, fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="submit" style={{ flex: 1, background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
              Insérer
            </button>
            <button
              type="button"
              aria-label="Supprimer le lien"
              onClick={() => {
                editor?.chain().focus().unsetLink().run();
                setUrl('');
                close();
              }}
              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 34, border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--card)', cursor: 'pointer', color: 'var(--ink)' }}
            >
              <LinkOffIcon size={15} />
            </button>
          </div>
        </form>
      )}
    </Popover>
  );
}
