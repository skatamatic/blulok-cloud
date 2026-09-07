import { BluDesignEventBus } from '../../../../components/bludesign/core/engine/BluDesignEventBus';

describe('BluDesignEventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new BluDesignEventBus();
    const fn = jest.fn();
    bus.on('ready', fn);
    bus.emit('ready', { x: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0][0].data).toEqual({ x: 1 });
    expect(fn.mock.calls[0][0].type).toBe('ready');
  });

  it('includes a numeric timestamp on each event', () => {
    const bus = new BluDesignEventBus();
    const fn = jest.fn();
    bus.on('ready', fn);
    bus.emit('ready', {});
    expect(typeof fn.mock.calls[0][0].timestamp).toBe('number');
  });

  it('emit with no subscribers does not throw', () => {
    const bus = new BluDesignEventBus();
    expect(() => bus.emit('ready', null)).not.toThrow();
  });

  it('notifies every subscriber on the same event type', () => {
    const bus = new BluDesignEventBus();
    const a = jest.fn();
    const b = jest.fn();
    bus.on('state-updated', a);
    bus.on('state-updated', b);
    bus.emit('state-updated', { k: 1 });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a.mock.calls[0][0].data).toEqual({ k: 1 });
  });

  it('unsubscribe stops delivery', () => {
    const bus = new BluDesignEventBus();
    const fn = jest.fn();
    const unsub = bus.on('state-updated', fn);
    unsub();
    bus.emit('state-updated', {});
    expect(fn).not.toHaveBeenCalled();
  });

  it('unsubscribe only removes the returned handler', () => {
    const bus = new BluDesignEventBus();
    const a = jest.fn();
    const b = jest.fn();
    bus.on('resize', a);
    const unsubB = bus.on('resize', b);
    unsubB();
    bus.emit('resize', { width: 1, height: 1 });
    expect(a).toHaveBeenCalled();
    expect(b).not.toHaveBeenCalled();
  });

  it('off removes a specific handler', () => {
    const bus = new BluDesignEventBus();
    const a = jest.fn();
    const b = jest.fn();
    bus.on('resize', a);
    bus.on('resize', b);
    bus.off('resize', a);
    bus.emit('resize', { width: 1, height: 1 });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });

  it('clear removes all listeners', () => {
    const bus = new BluDesignEventBus();
    const fn = jest.fn();
    bus.on('ready', fn);
    bus.clear();
    bus.emit('ready', null);
    expect(fn).not.toHaveBeenCalled();
  });

  it('does not throw if handler throws', () => {
    const bus = new BluDesignEventBus();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    bus.on('ready', () => {
      throw new Error('bad');
    });
    expect(() => bus.emit('ready', null)).not.toThrow();
    err.mockRestore();
  });

  it('still invokes later handlers when an earlier handler throws', () => {
    const bus = new BluDesignEventBus();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const second = jest.fn();
    bus.on('ready', () => {
      throw new Error('first');
    });
    bus.on('ready', second);
    bus.emit('ready', null);
    expect(second).toHaveBeenCalledTimes(1);
    err.mockRestore();
  });
});
