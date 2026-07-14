// CS-4 item 13 — progressive multi-click selection: double-click = word (ProseMirror default),
// triple-click = sentence, quadruple-click = paragraph (the whole textblock). ProseMirror natively
// does only word (double) then whole-textblock (triple); this inserts the sentence tier at triple and
// pushes the paragraph to quadruple.
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import type { EditorState } from '@tiptap/pm/state';

/** Character bounds of the sentence containing `offset` within `text`. Sentences end at a run of
 *  `.!?…`; the leading whitespace of the matched sentence is trimmed. Pure + exported for testing. */
export function sentenceBounds(text: string, offset: number): { start: number; end: number } {
  const bounds = [0];
  const re = /[.!?…]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) bounds.push(m.index + m[0].length);
  if (bounds[bounds.length - 1] !== text.length) bounds.push(text.length);

  let start = 0;
  let end = text.length;
  for (let i = 0; i < bounds.length - 1; i++) {
    if (offset >= bounds[i] && offset <= bounds[i + 1]) {
      start = bounds[i];
      end = bounds[i + 1];
      break;
    }
  }
  while (start < end && /\s/.test(text[start])) start++;
  return { start, end };
}

/** The nearest textblock ancestor of `pos` and the doc position of its first content character.
 *  ponytail: maps char offsets to doc positions 1:1, which is exact for plain-text runs; inline
 *  atoms/hard-breaks (nodeSize 1, empty textContent) would drift — fine for prose scenarios. */
function textblockAt(state: EditorState, pos: number): { start: number; end: number; text: string } | null {
  const $pos = state.doc.resolve(Math.max(0, Math.min(pos, state.doc.content.size)));
  for (let d = $pos.depth; d >= 0; d--) {
    if ($pos.node(d).isTextblock) {
      return { start: $pos.start(d), end: $pos.end(d), text: $pos.node(d).textContent };
    }
  }
  return null;
}

function selectSentence(state: EditorState, pos: number): TextSelection | null {
  const block = textblockAt(state, pos);
  if (!block) return null;
  const { start, end } = sentenceBounds(block.text, pos - block.start);
  return TextSelection.create(state.doc, block.start + start, block.start + end);
}

function selectParagraph(state: EditorState, pos: number): TextSelection | null {
  const block = textblockAt(state, pos);
  if (!block) return null;
  return TextSelection.create(state.doc, block.start, block.end);
}

export const MultiClickSelect = Extension.create({
  name: 'multiClickSelect',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          // detail === 3 → select the sentence (return true to suppress the default whole-block select).
          handleTripleClick(view, pos) {
            const sel = selectSentence(view.state, pos);
            if (!sel) return false;
            view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
            return true;
          },
          handleDOMEvents: {
            // detail >= 4 → select the whole paragraph (ProseMirror has no quadruple-click hook).
            mousedown(view, event) {
              const me = event as MouseEvent;
              if (me.detail < 4) return false;
              const at = view.posAtCoords({ left: me.clientX, top: me.clientY });
              if (!at) return false;
              const sel = selectParagraph(view.state, at.pos);
              if (!sel) return false;
              event.preventDefault();
              view.dispatch(view.state.tr.setSelection(sel).scrollIntoView());
              return true;
            },
          },
        },
      }),
    ];
  },
});
