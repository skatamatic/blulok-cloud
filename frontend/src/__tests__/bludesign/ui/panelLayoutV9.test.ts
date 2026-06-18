import {
  ALL_PANEL_IDS,
  mergeLayoutWithDefaultsV9,
  defaultDockSideState,
  dockPanel,
  floatPanel,
  reorderDockPanelIds,
  type PanelLayoutStateV9,
} from '../../../components/bludesign/ui/panelLayoutV9';

function minimalDefaults(): PanelLayoutStateV9 {
  const base = (x: number, y: number) => ({
    x,
    y,
    collapsed: false,
    visible: true,
    placement: 'float' as const,
  });
  return {
    tools: base(1, 1),
    assets: { ...base(2, 2), width: 400 },
    view: base(3, 3),
    properties: base(4, 4),
    floors: base(5, 5),
    skins: base(6, 6),
    datasource: base(7, 7),
    smartobjects: base(8, 8),
    buildingSkin: base(9, 9),
    defaultCamera: { ...base(10, 10), visible: false },
    importPlan: { ...base(11, 11), visible: false, width: 360, height: 320 },
    terrain: { ...base(12, 12), visible: false },
    docks: {
      left: defaultDockSideState(),
      right: defaultDockSideState(),
    },
  };
}

describe('panelLayoutV9', () => {
  it('mergeLayoutWithDefaultsV9 adds docks and placement from v8-shaped JSON', () => {
    const defaults = minimalDefaults();
    const v8 = {
      tools: { x: 10, y: 20, collapsed: false, visible: true },
      assets: { x: 0, y: 0, collapsed: false, visible: true, width: 300 },
    };
    const merged = mergeLayoutWithDefaultsV9(v8, defaults);
    expect(merged.docks.left.panelIds).toEqual([]);
    expect(merged.tools.placement).toBe('float');
    expect(merged.tools.x).toBe(10);
    expect(merged.tools.y).toBe(20);
    expect(ALL_PANEL_IDS.length).toBe(12);
  });

  it('dockPanel sets placement and panelIds', () => {
    const defaults = minimalDefaults();
    const next = dockPanel(defaults, 'tools', 'left');
    expect(next.tools.placement).toBe('dock-left');
    expect(next.docks.left.panelIds).toContain('tools');
    expect(next.docks.left.activeId).toBe('tools');
  });

  it('floatPanel restores float placement', () => {
    let layout = minimalDefaults();
    layout = dockPanel(layout, 'view', 'right');
    expect(layout.view.placement).toBe('dock-right');
    const floated = floatPanel(layout, 'view', { x: 12, y: 34 });
    expect(floated.view.placement).toBe('float');
    expect(floated.view.x).toBe(12);
    expect(floated.view.y).toBe(34);
    expect(floated.docks.right.panelIds).not.toContain('view');
  });

  it('reorderDockPanelIds moves an id within dock panelIds', () => {
    let layout = minimalDefaults();
    layout = dockPanel(layout, 'tools', 'left');
    layout = dockPanel(layout, 'assets', 'left');
    layout = dockPanel(layout, 'view', 'left');
    expect(layout.docks.left.panelIds).toEqual(['tools', 'assets', 'view']);
    const re = reorderDockPanelIds(layout, 'left', 2, 0);
    expect(re.docks.left.panelIds).toEqual(['view', 'tools', 'assets']);
  });
});
