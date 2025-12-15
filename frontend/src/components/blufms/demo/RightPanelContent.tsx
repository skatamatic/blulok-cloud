import React, { useRef, useEffect } from 'react';
import { StatusCard } from './StatusCard';
import { DetailCard } from './DetailCard';
import { WorkOrderCard } from './WorkOrderCard';
import { MessagePreviewCard } from './MessagePreviewCard';
import { TimelineCard } from './TimelineCard';
import { ChecklistCard } from './ChecklistCard';
import { EphemeralStatusCard } from './EphemeralStatusCard';
import { CardData } from '@/scripts/blufms/demoActionTypes';

interface RightPanelContentProps {
  cards: CardData[];
  ephemeralCards?: Array<{ id: string; type: 'success' | 'info' | 'warning' | 'error'; title: string; message?: string }>;
  currentWorkflow?: string | null;
  isWorkflowComplete?: boolean;
  reportGenerationProgress?: number | null; // 0-100 or null
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
  reportGenerationProgress = null,
  onShowCardDetails: _onShowCardDetails,
  onViewWorkflowReport,
  onTimelineMarkerClick,
  onDismissEphemeral,
}) => {
  const workflowReportMap: Record<string, 'morning-report' | 'security-incident' | 'pest-response' | 'occupancy'> = {
    'workflow1-morning-report': 'morning-report',
    'workflow2-security-incident': 'security-incident',
    'workflow3-pest-response': 'pest-response',
    'workflow4-occupancy-visualization': 'occupancy',
  };

  const hasReport = currentWorkflow && workflowReportMap[currentWorkflow];
  const showReportButton = hasReport && isWorkflowComplete && onViewWorkflowReport;
  const showReportProgress = hasReport && reportGenerationProgress !== null && reportGenerationProgress < 100;
  
  // Ref for scrollable container to enable auto-scroll
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  // Auto-scroll to bottom when new ephemeral cards are added
  useEffect(() => {
    if (scrollContainerRef.current && ephemeralCards.length > 0) {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTo({
            top: scrollContainerRef.current.scrollHeight,
            behavior: 'smooth',
          });
        }
      }, 100);
    }
  }, [ephemeralCards.length]);

  return (
    <div className="flex flex-col h-full">
      {/* Report Generation Progress or Button - Sticky at top */}
      {showReportProgress && (
        <div className="flex-shrink-0 mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-primary-600 dark:text-primary-400 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-white">Generating Full Report</span>
              </div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{reportGenerationProgress}%</span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary-600 dark:bg-primary-500 transition-all duration-300 ease-out"
                style={{ width: `${reportGenerationProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
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
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0 space-y-4 pr-1 status-area-scrollbar">

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
                case 'checklist':
                  return (
                    <ChecklistCard
                      key={card.id}
                      card={card}
                    />
                  );
                default:
                  return null;
              }
            })}
            
            {/* Ephemeral status cards (toast replacements) - at bottom */}
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
            
            {/* Bottom padding to ensure last card is fully visible */}
            <div className="h-4" />
          </>
        )}
      </div>
    </div>
  );
};

