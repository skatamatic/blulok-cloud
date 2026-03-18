import { WidgetSize } from '@/types/widget.types';

export interface WidgetConfig {
  id: string;
  type: string;
  title: string;
  position: { x: number; y: number; w: number; h: number };
  size: WidgetSize;
  config?: Record<string, unknown>;
}

export interface WidgetInstance {
  id: string;
  type: string;
  title: string;
  size: WidgetSize;
  config?: Record<string, unknown>;
}
