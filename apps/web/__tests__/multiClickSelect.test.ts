import { describe, it, expect } from 'vitest';
import { sentenceBounds } from '../components/editor/richtext/multi-click-select';

// Item 13 — triple-click selects the SENTENCE containing the caret (the tier the
// ProseMirror default skips between "word" and "whole paragraph").
describe('sentenceBounds', () => {
  const text = 'Bonjour le monde. Comment ça va ? Très bien !';

  it('selects the sentence around an offset in the first sentence', () => {
    // offset inside "Bonjour"
    const { start, end } = sentenceBounds(text, 3);
    expect(text.slice(start, end)).toBe('Bonjour le monde.');
  });

  it('selects the middle sentence and trims the leading space', () => {
    // offset inside "Comment"
    const { start, end } = sentenceBounds(text, 20);
    expect(text.slice(start, end)).toBe('Comment ça va ?');
  });

  it('selects the last sentence up to the end', () => {
    const { start, end } = sentenceBounds(text, 40);
    expect(text.slice(start, end)).toBe('Très bien !');
  });

  it('falls back to the whole text when there is no terminator', () => {
    const one = 'un paragraphe sans ponctuation finale';
    expect(sentenceBounds(one, 5)).toEqual({ start: 0, end: one.length });
  });
});
