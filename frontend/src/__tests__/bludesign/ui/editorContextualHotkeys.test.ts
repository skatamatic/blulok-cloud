import { EditorTool } from '../../../components/bludesign/core/types';
import {
  EDITOR_HELP_SECTIONS,
  getContextTitle,
  getContextualHotkeys,
} from '../../../components/bludesign/ui/editorContextualHotkeys';

describe('editorContextualHotkeys', () => {
  it('defines static help sections for major editor modes', () => {
    expect(EDITOR_HELP_SECTIONS.map((s) => s.title)).toEqual(
      expect.arrayContaining(['Selection', 'Placement', 'Camera'])
    );
  });

  it('returns contextual titles based on tool and placement state', () => {
    expect(getContextTitle(EditorTool.PLACE, true)).toBe('Placement');
    expect(getContextTitle(EditorTool.SELECT, false)).toBe('Selection');
    expect(getContextTitle(EditorTool.SELECT_BUILDING, false)).toBe('Building');
    expect(getContextTitle(EditorTool.MOVE, false)).toBe('Move');
    expect(getContextTitle(EditorTool.VIEW, false)).toBe('Controls');
  });

  it('includes placement hotkeys only while actively placing', () => {
    const placing = getContextualHotkeys(EditorTool.PLACE, true, false, false);
    expect(placing.some((h) => h.key === 'Q')).toBe(true);

    const notPlacing = getContextualHotkeys(EditorTool.PLACE, false, false, false);
    expect(notPlacing.some((h) => h.key === 'Q')).toBe(false);
  });

  it('adds clipboard and delete hints when selection context allows', () => {
    const withSelection = getContextualHotkeys(EditorTool.SELECT, false, true, false);
    expect(withSelection.some((h) => h.key === 'Del')).toBe(true);
    expect(withSelection.some((h) => h.key === 'C')).toBe(true);

    const withClipboard = getContextualHotkeys(EditorTool.SELECT, false, false, true);
    expect(withClipboard.some((h) => h.key === 'V' && h.modifier === 'alt')).toBe(true);
  });
});
