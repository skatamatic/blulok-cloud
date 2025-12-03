import React from 'react';
import { StatusCard } from './StatusCard';
import { DetailCard } from './DetailCard';
import { WorkOrderCard } from './WorkOrderCard';
import { MessagePreviewCard } from './MessagePreviewCard';
import { TimelineCard } from './TimelineCard';
import { EphemeralStatusCard } from './EphemeralStatusCard';
import { CardLoadingPlaceholder } from './CardLoadingPlaceholder';
import { CardData } from '@/scripts/blufms/demoActionTypes';

interface RightPanelContentProps {
  cards: CardData[];
  ephemeralCards?: Array<{ id: string; type: 'success' | 'info' | 'warning' | 'error'; title: string; message?: string }>;
  currentWorkflow?: string | null;
  isWorkflowComplete?: boolean;
  onShowCardDetails?: (cardId: string) => void;
  onViewWorkflowReport?: (workflowId: string) => void;
  onTimelineMarkerClick?: (cardId: string, step: number) => void;
  onDismissEphemeral?: (id: string) => void;
}

export const RightPanelContent: React.FC<RightPanelContentProps> = ({
  cards,
  ephemeralCards = [],
  currentWorkflow,
  isWorkflowComplete = false,
  onShowCardDetails,
  onViewWorkflowReport,
  onTimelineMarkerClick,
  onDismissEphemeral,
}) => {
  const workflowReportMap: Record<string, 'morning-report' | 'security-incident' | 'pest-response' | 'occupancy'> = {
    'workflow0-login-facility': 'morning-report',
    'workflow1-morning-report': 'morning-report',
    'workflow2-security-incident': 'security-incident',
    'workflow3-pest-response': 'pest-response',
    'workflow4-occupancy-visualization': 'occupancy',
  };

  const showReportButton = currentWorkflow && isWorkflowComplete && onViewWorkflowReport && workflowReportMap[currentWorkflow];

  return (
    <div className="flex flex-col h-full">
      {/* Workflow Report Button - Sticky at top */}
      {showReportButton && (
        <div className="flex-shrink-0 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => onViewWorkflowReport(currentWorkflow!)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg text-sm font-semibold"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>View Full Report</span>
          </button>
        </div>
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1">

        {/* Ephemeral status cards (toast replacements) */}
        {ephemeralCards.map((ephemeral) => (
          <EphemeralStatusCard
            key={ephemeral.id}
            id={ephemeral.id}
            type={ephemeral.type}
            title={ephemeral.title}
            message={ephemeral.message}
            onDismiss={onDismissEphemeral}
          />
        ))}

        {/* Regular cards */}
        {cards.length === 0 && ephemeralCards.length === 0 ? (
          <div className="text-center py-8">
            <div className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3 flex items-center justify-center">
              <svg
                className="w-full h-full"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 9h6M9 15h6" />
              </svg>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Status and agentic flow cards will appear here
            </p>
          </div>
        ) : (
          <>
            {cards.map((card) => {
              switch (card.type) {
                case 'security':
                case 'maintenance':
                case 'payments':
                case 'moveins':
                case 'occupancy':
                case 'blulok-network':
                case 'sensor-cctv':
                  return (
                    <StatusCard
                      key={card.id}
                      card={card}
                    />
                  );
                case 'detail':
                  return <DetailCard key={card.id} card={card} />;
                case 'workorder':
                  return <WorkOrderCard key={card.id} card={card} />;
                case 'message':
                  return <MessagePreviewCard key={card.id} card={card} />;
                case 'timeline':
                  return (
                    <TimelineCard
                      key={card.id}
                      markers={card.markers}
                      currentStep={card.currentStep}
                      onMarkerClick={onTimelineMarkerClick ? (step) => onTimelineMarkerClick(card.id, step) : undefined}
                    />
                  );
                default:
                  return null;
              }
            })}
            {/* Bottom padding to ensure last card is fully visible */}
            <div className="h-4" />
          </>
        )}
      </div>
    </div>
  );
};

