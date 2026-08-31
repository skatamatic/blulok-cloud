import { tryStartClipboardPastePreview } from '../../../../components/bludesign/core/clipboard/startClipboardPastePreview';
import type { PlacedObject } from '../../../../components/bludesign/core/types';

const obj = { id: 'o1' } as PlacedObject;

describe('tryStartClipboardPastePreview', () => {
  it('returns false when clipboard reports no content', () => {
    const port = {
      hasClipboardContent: () => false,
      getClipboardObjects: jest.fn(() => [obj]),
      startPastePreview: jest.fn(),
      activatePlaceTool: jest.fn(),
    };
    expect(tryStartClipboardPastePreview(port)).toBe(false);
    expect(port.startPastePreview).not.toHaveBeenCalled();
  });

  it('returns false when objects list is empty', () => {
    const port = {
      hasClipboardContent: () => true,
      getClipboardObjects: () => [] as PlacedObject[],
      startPastePreview: jest.fn(),
      activatePlaceTool: jest.fn(),
    };
    expect(tryStartClipboardPastePreview(port)).toBe(false);
    expect(port.startPastePreview).not.toHaveBeenCalled();
  });

  it('starts preview, activates place tool, returns true', () => {
    const startPastePreview = jest.fn();
    const activatePlaceTool = jest.fn();
    const port = {
      hasClipboardContent: () => true,
      getClipboardObjects: () => [obj],
      startPastePreview,
      activatePlaceTool,
    };
    expect(tryStartClipboardPastePreview(port)).toBe(true);
    expect(startPastePreview).toHaveBeenCalledWith([obj]);
    expect(activatePlaceTool).toHaveBeenCalledTimes(1);
  });
});
