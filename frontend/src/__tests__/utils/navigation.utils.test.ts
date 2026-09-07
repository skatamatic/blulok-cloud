/**
 * @jest-environment jsdom
 */
import {
  calculatePageForItem,
  calculatePageForItemInFullDataset,
  navigateAndHighlight,
  navigateAndHighlightWithPagination,
  navigateAndHighlightWithAutoPagination,
  getHighlightIdFromUrl,
  generateHighlightId,
  highlightElement,
} from '@/utils/navigation.utils';

const mockGetPageForItem = jest.fn();

jest.mock('@/services/pagination.service', () => ({
  paginationService: {
    getPageForItem: (...args: unknown[]) => mockGetPageForItem(...args),
  },
}));

describe('navigation.utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetPageForItem.mockResolvedValue({ page: 3, totalPages: 5, totalItems: 100, itemsPerPage: 20 });
  });

  it('calculatePageForItem is 1-based', () => {
    expect(calculatePageForItem(0, 20)).toBe(1);
    expect(calculatePageForItem(19, 20)).toBe(1);
    expect(calculatePageForItem(20, 20)).toBe(2);
  });

  it('calculatePageForItemInFullDataset returns 1 when missing', () => {
    expect(calculatePageForItemInFullDataset('x', [{ id: 'a' }], 20)).toBe(1);
  });

  it('calculatePageForItemInFullDataset finds page', () => {
    const data = Array.from({ length: 45 }, (_, i) => ({ id: `id-${i}` }));
    expect(calculatePageForItemInFullDataset('id-25', data, 20)).toBe(2);
  });

  it('navigateAndHighlight builds path and highlight param', () => {
    const navigate = jest.fn();
    void navigateAndHighlight(navigate, { id: 'u1', type: 'user', page: 2, searchParams: { q: 'x' } });
    expect(navigate).toHaveBeenCalledWith('/users?page=2&q=x&highlight=u1');
  });

  it('navigateAndHighlight works for facility, unit, device', () => {
    const nav = jest.fn();
    void navigateAndHighlight(nav, { id: '1', type: 'facility' });
    expect(nav).toHaveBeenCalledWith('/facilities?highlight=1');
    void navigateAndHighlight(nav, { id: '2', type: 'unit' });
    expect(nav).toHaveBeenCalledWith('/units?highlight=2');
    void navigateAndHighlight(nav, { id: '3', type: 'device' });
    expect(nav).toHaveBeenCalledWith('/devices?highlight=3');
  });

  it('navigateAndHighlightWithPagination computes page from dataset', () => {
    const navigate = jest.fn();
    const all = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    void navigateAndHighlightWithPagination(navigate, { id: 'c', type: 'unit' }, all, 2);
    expect(navigate).toHaveBeenCalledWith('/units?page=2&highlight=c');
  });

  it('navigateAndHighlightWithAutoPagination uses pagination service', async () => {
    const navigate = jest.fn();
    await navigateAndHighlightWithAutoPagination(navigate, { id: 'x', type: 'facility' }, 20);
    expect(mockGetPageForItem).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/facilities?page=3&highlight=x');
  });

  it('navigateAndHighlightWithAutoPagination falls back on error', async () => {
    mockGetPageForItem.mockRejectedValueOnce(new Error('fail'));
    const navigate = jest.fn();
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await navigateAndHighlightWithAutoPagination(navigate, { id: 'y', type: 'device' }, 20);
    expect(navigate).toHaveBeenCalledWith('/devices?page=1&highlight=y');
    spy.mockRestore();
  });

  it('getHighlightIdFromUrl and generateHighlightId', () => {
    expect(getHighlightIdFromUrl(new URLSearchParams('?highlight=abc'))).toBe('abc');
    expect(getHighlightIdFromUrl(new URLSearchParams(''))).toBeNull();
    expect(generateHighlightId('unit', 'u1')).toBe('unit-u1');
  });

  it('highlightElement no-ops when element missing', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    highlightElement('missing');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('highlightElement attaches overlay and clears after duration', () => {
    jest.useFakeTimers();
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const el = document.createElement('div');
    el.id = 'hl-target';
    document.body.appendChild(el);

    highlightElement('hl-target', 1000, '#ff0000');

    expect(scrollIntoView).toHaveBeenCalled();
    expect(el.querySelector('div')).toBeTruthy();

    jest.advanceTimersByTime(1000);
    expect(el.querySelector('div')).toBeNull();

    jest.useRealTimers();
  });
});
