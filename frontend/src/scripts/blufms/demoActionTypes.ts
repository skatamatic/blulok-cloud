export type MapLayer = 'network' | 'security' | 'heatmap' | 'energy' | 'sensors';

export type CardStatusColor = 'green' | 'blue' | 'yellow' | 'orange' | 'red' | 'gray';

export interface StatusCardData {
  id: string;
  type: 'security' | 'maintenance' | 'payments' | 'moveins' | 'occupancy' | 'blulok-network' | 'sensor-cctv';
  title: string;
  primaryValue: string;
  secondaryValue?: string;
  statusColor?: CardStatusColor;
  badge?: {
    text: string;
    color: CardStatusColor;
  };
  icon?: React.ComponentType<{ className?: string }>;
  showDetails?: boolean;
  detailsContent?: React.ReactNode;
  isLoading?: boolean;
  loadingProgress?: number; // 0-100
  loadingMessage?: string;
  hasSignificantDetails?: boolean; // Only show "View Details" if true
  videoUrl?: string; // URL to MP4 video file
}

export interface DetailCardData {
  id: string;
  type: 'detail';
  title: string;
  content: React.ReactNode;
  showDetails?: boolean;
  detailsContent?: React.ReactNode;
  isLoading?: boolean;
  loadingProgress?: number; // 0-100
  loadingMessage?: string;
}

export interface TimelineCardData {
  id: string;
  type: 'timeline';
  markers: TimelineMarker[];
  currentStep: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
  timestamp?: string;
}

export interface ChecklistCardData {
  id: string;
  type: 'checklist';
  title: string;
  items: ChecklistItem[];
  completionMessage?: string;
  isLoading?: boolean;
  loadingProgress?: number; // 0-100
  loadingMessage?: string;
}

export interface WorkOrderCardData {
  id: string;
  type: 'workorder';
  workOrderNumber: string;
  issue: string;
  unit: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in-progress' | 'completed' | 'closed';
  assignedTo?: string;
  dueDate?: string;
  completionEvidence?: {
    photo?: string;
    timestamp?: string;
    notes?: string;
  };
  isLoading?: boolean;
  loadingProgress?: number; // 0-100
  loadingMessage?: string;
}

export interface MessagePreviewCardData {
  id: string;
  type: 'message';
  messageType: 'email' | 'sms';
  subject?: string;
  to: string;
  from?: string;
  body: string;
  timestamp?: string;
  status?: 'sent' | 'pending' | 'failed';
  isLoading?: boolean;
  loadingProgress?: number; // 0-100
  loadingMessage?: string;
}

export type CardData = StatusCardData | DetailCardData | WorkOrderCardData | MessagePreviewCardData | TimelineCardData | ChecklistCardData;

export interface TimelineMarker {
  id: string;
  label: string;
  timestamp?: string;
  step: number;
}

export interface ToastData {
  type: 'success' | 'info' | 'warning' | 'error' | 'critical';
  title: string;
  message?: string;
  persistent?: boolean;
}

export type DemoAction =
  | { type: 'delay'; duration: number }
  | { type: 'addStatusCard'; card: StatusCardData }
  | { type: 'addDetailCard'; card: DetailCardData; showDetails?: boolean }
  | { type: 'addWorkOrderCard'; card: WorkOrderCardData }
  | { type: 'addMessageCard'; card: MessagePreviewCardData }
  | { type: 'addTimelineCard'; card: TimelineCardData }
  | { type: 'addChecklistCard'; card: ChecklistCardData }
  | { type: 'updateCard'; cardId: string; updates: Partial<CardData> }
  | { type: 'updateChecklistItem'; cardId: string; itemId: string; completed: boolean; timestamp?: string }
  | { type: 'removeCard'; cardId: string }
  | { type: 'clearCards' }
  | { type: 'changeMapFilter'; layer: MapLayer }
  | { type: 'changeMapContent'; content: string }
  | { type: 'updateVoiceStatus'; status: string }
  | { type: 'showToast'; toast: ToastData }
  | { type: 'addEphemeralStatus'; id: string; statusType: 'success' | 'info' | 'warning' | 'error'; title: string; message?: string }
  | { type: 'showTimeline'; visible: boolean }
  | { type: 'updateTimeline'; markers: TimelineMarker[] }
  | { type: 'setTimelineStep'; step: number }
  | { type: 'updateTimelineCard'; cardId: string; currentStep: number }
  | { type: 'updateReportGenerationProgress'; progress: number }; // 0-100

export interface DemoScript {
  id: string;
  name: string;
  description: string;
  actions: DemoAction[];
}

export interface DemoScriptCallbacks {
  onCardAdded?: (card: CardData) => void;
  onCardUpdated?: (cardId: string, updates: Partial<CardData>) => void;
  onCardRemoved?: (cardId: string) => void;
  onCardsCleared?: () => void;
  onMapFilterChanged?: (layer: MapLayer) => void;
  onMapContentChanged?: (content: string) => void;
  onVoiceStatusUpdated?: (status: string) => void;
  onToastShown?: (toast: ToastData) => void;
  onEphemeralStatusAdded?: (id: string, type: 'success' | 'info' | 'warning' | 'error', title: string, message?: string) => void;
  onTimelineShown?: (visible: boolean) => void;
  onTimelineUpdated?: (markers: TimelineMarker[]) => void;
  onTimelineStepSet?: (step: number) => void;
  onStepChanged?: (step: number, totalSteps: number) => void;
  onReportGenerationProgress?: (progress: number) => void; // 0-100
  onChecklistItemUpdated?: (cardId: string, itemId: string, completed: boolean, timestamp?: string) => void;
  onScriptComplete?: () => void;
  onScriptError?: (error: Error) => void;
}

