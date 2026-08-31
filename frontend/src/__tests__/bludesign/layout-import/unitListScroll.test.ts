import { scrollRowFullyVisible } from '@/components/bludesign/layout-import/unitListScroll';

describe('scrollRowFullyVisible', () => {
  it('scrolls down when the row extends below the container', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', { value: 0, writable: true });
    const row = document.createElement('div');

    container.getBoundingClientRect = () =>
      ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
    row.getBoundingClientRect = () =>
      ({ top: 250, bottom: 420, left: 0, right: 200, width: 200, height: 170, x: 0, y: 250, toJSON: () => ({}) }) as DOMRect;

    scrollRowFullyVisible(row, container, 8);
    expect(container.scrollTop).toBe(128);
  });

  it('scrolls up when the row extends above the container', () => {
    const container = document.createElement('div');
    Object.defineProperty(container, 'scrollTop', { value: 200, writable: true });
    const row = document.createElement('div');

    container.getBoundingClientRect = () =>
      ({ top: 100, bottom: 300, left: 0, right: 200, width: 200, height: 200, x: 0, y: 100, toJSON: () => ({}) }) as DOMRect;
    row.getBoundingClientRect = () =>
      ({ top: 80, bottom: 180, left: 0, right: 200, width: 200, height: 100, x: 0, y: 80, toJSON: () => ({}) }) as DOMRect;

    scrollRowFullyVisible(row, container, 8);
    expect(container.scrollTop).toBe(172);
  });
});
