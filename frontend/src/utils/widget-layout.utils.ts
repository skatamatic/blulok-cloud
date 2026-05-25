import { WidgetSize } from '@/types/widget.types';
import { isDockSize } from '@/utils/dashboard-layout-engine';

/** Visual density tier for responsive widget interiors. */
export type WidgetDensity = 'micro' | 'compact' | 'comfortable' | 'spacious';

export interface WidgetShellStyles {
  headerPadding: string;
  contentPadding: string;
  titleSize: string;
  titleTruncate: string;
  /** Content wrapper overflow — scroll lives on inner lists. */
  contentOverflow: string;
  /** Header action buttons (fullscreen, menu). */
  headerActionPadding: string;
  headerIconSize: string;
}

export interface WidgetLayoutProfile {
  density: WidgetDensity;
  isDock: boolean;
  isWide: boolean;
  isTall: boolean;
  isVerticalDock: boolean;
  isHorizontalDock: boolean;
  listCap: number;
  shell: WidgetShellStyles;
}

/**
 * Dock-shaped free-form grid (after undock or grip resize) — keeps the same
 * interior layout profile as the matching dock preset without re-docking.
 */
export type FreeGridLayoutShape =
  | 'horizontal-strip'
  | 'vertical-strip'
  | 'two-thirds-panel'
  | 'full-panel';

/** Infer dock-equivalent layout shape from live grid cells (non-dock widgets only). */
export function inferFreeGridLayoutShape(
  w: number,
  h: number
): FreeGridLayoutShape | null {
  if (w >= 10 && h <= 3) return 'horizontal-strip';
  if (w >= 10 && h === 4) return 'two-thirds-panel';
  if (w >= 10 && h >= 5) return 'full-panel';
  if (w <= 6 && h >= 5) return 'vertical-strip';
  return null;
}

/** Uniform header chrome for every non-tiny widget size (title, padding, action icons). */
export const STANDARD_WIDGET_HEADER: Pick<
  WidgetShellStyles,
  'headerPadding' | 'titleSize' | 'titleTruncate' | 'headerActionPadding' | 'headerIconSize'
> = {
  headerPadding: 'px-3 py-1.5',
  titleSize: 'text-xs',
  titleTruncate: 'truncate',
  headerActionPadding: 'p-1',
  headerIconSize: 'h-3 w-3',
};

function withStandardHeader(
  shell: Pick<WidgetShellStyles, 'contentPadding' | 'contentOverflow'>
): WidgetShellStyles {
  return { ...STANDARD_WIDGET_HEADER, ...shell };
}

const COMPACT_DOCK_CONTENT = {
  contentPadding: 'px-3 py-2',
  contentOverflow: 'overflow-hidden' as const,
};

function profileForFreeGridShape(
  shape: FreeGridLayoutShape,
  gridH: number
): WidgetLayoutProfile {
  switch (shape) {
    case 'horizontal-strip':
      return {
        density: 'compact',
        isDock: false,
        isWide: true,
        isTall: false,
        isVerticalDock: false,
        isHorizontalDock: true,
        listCap: gridH <= 2 ? 6 : 8,
        shell: withStandardHeader(COMPACT_DOCK_CONTENT),
      };
    case 'two-thirds-panel':
      return {
        density: 'compact',
        isDock: false,
        isWide: true,
        isTall: true,
        isVerticalDock: false,
        isHorizontalDock: true,
        listCap: 14,
        shell: withStandardHeader(COMPACT_DOCK_CONTENT),
      };
    case 'vertical-strip':
      return {
        density: 'compact',
        isDock: false,
        isWide: false,
        isTall: true,
        isVerticalDock: true,
        isHorizontalDock: false,
        listCap: 16,
        shell: withStandardHeader(COMPACT_DOCK_CONTENT),
      };
    case 'full-panel':
      return {
        density: 'compact',
        isDock: false,
        isWide: true,
        isTall: true,
        isVerticalDock: false,
        isHorizontalDock: true,
        listCap: 24,
        shell: withStandardHeader(COMPACT_DOCK_CONTENT),
      };
  }
}

/** Standard flex column for widget body (use inside Widget content). */
export const WIDGET_BODY_CLASS = 'flex flex-col flex-1 min-h-0 overflow-hidden';

/** Scrollable list region inside a widget body. */
export const WIDGET_LIST_SCROLL_CLASS =
  'flex-1 min-h-0 overflow-y-auto overscroll-contain';

export function isWideWidgetSize(size: WidgetSize): boolean {
  if (isDockSize(size)) {
    return size !== 'dock-left' && size !== 'dock-right';
  }
  return (
    size.includes('wide') ||
    size === 'huge' ||
    size === 'large-wide' ||
    size === 'huge-wide'
  );
}

export function isTallWidgetSize(size: WidgetSize): boolean {
  return (
    size === 'medium-tall' ||
    size === 'mega-tall' ||
    size === 'dock-left' ||
    size === 'dock-right' ||
    size === 'dock-bottom-two-thirds' ||
    size === 'dock-full' ||
    size === 'huge' ||
    size === 'huge-wide'
  );
}

/**
 * Max list rows to render before "view all" / scroll (activity, notifications, tenant lists).
 */
export function getWidgetListCap(size: WidgetSize, isFullscreen = false): number {
  if (isFullscreen) return 48;
  if (isDockSize(size)) {
    switch (size) {
      case 'dock-bottom-two-thirds':
        return 14;
      case 'dock-left':
      case 'dock-right':
        return 16;
      case 'dock-top':
      case 'dock-bottom':
        return 8;
      case 'dock-full':
        return 24;
      default:
        return 10;
    }
  }
  switch (size) {
    case 'tiny':
      return 1;
    case 'small':
      return 3;
    case 'medium':
      return 5;
    case 'medium-tall':
      return 10;
    case 'large':
      return 8;
    case 'large-wide':
      return 10;
    case 'huge':
      return 14;
    case 'huge-wide':
      return 18;
    case 'mega-tall':
      return 20;
    default:
      return 5;
  }
}

export function getWidgetLayoutProfile(
  size: WidgetSize,
  options?: { isFullscreen?: boolean; gridW?: number; gridH?: number }
): WidgetLayoutProfile {
  const isFullscreen = options?.isFullscreen ?? false;
  const isDock = isDockSize(size);

  if (isFullscreen) {
    return {
      density: 'spacious',
      isDock: false,
      isWide: true,
      isTall: true,
      isVerticalDock: false,
      isHorizontalDock: false,
      listCap: getWidgetListCap(size, true),
      shell: withStandardHeader({
        contentPadding: 'p-4',
        contentOverflow: 'overflow-hidden',
      }),
    };
  }

  if (!isDock && options?.gridW != null && options?.gridH != null) {
    const shape = inferFreeGridLayoutShape(options.gridW, options.gridH);
    if (shape) {
      return profileForFreeGridShape(shape, options.gridH);
    }
  }

  const isVerticalDock = size === 'dock-left' || size === 'dock-right';
  const isHorizontalDock =
    isDock && !isVerticalDock;
  const isWide = isWideWidgetSize(size);
  const isTall = isTallWidgetSize(size);

  let density: WidgetDensity = 'comfortable';
  let shell: WidgetShellStyles;

  if (isDock) {
    density = 'compact';
    shell = withStandardHeader(COMPACT_DOCK_CONTENT);
  } else if (size === 'tiny' || size === 'small') {
    density = size === 'tiny' ? 'micro' : 'compact';
    shell = withStandardHeader({
      contentPadding: size === 'tiny' ? 'p-1' : 'p-2',
      contentOverflow: 'overflow-hidden',
    });
  } else if (size === 'medium' || size === 'medium-tall') {
    density = 'comfortable';
    shell = withStandardHeader({
      contentPadding: 'p-4',
      contentOverflow: 'overflow-hidden',
    });
  } else {
    density = 'spacious';
    shell = withStandardHeader({
      contentPadding: 'p-5',
      contentOverflow: 'overflow-hidden',
    });
  }

  return {
    density,
    isDock,
    isWide,
    isTall,
    isVerticalDock,
    isHorizontalDock,
    listCap: getWidgetListCap(size, isFullscreen),
    shell,
  };
}
