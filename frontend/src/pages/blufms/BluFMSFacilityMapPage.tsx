import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  BuildingOfficeIcon,
  SignalIcon,
  ShieldCheckIcon,
  FireIcon,
  BoltIcon,
  CpuChipIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { useBluFMSFacility } from '@/contexts/BluFMSFacilityContext';
import { VoiceChatWaveform } from '@/components/blufms/VoiceChatWaveform';
import { useToast } from '@/contexts/ToastContext';
import { DemoPlayer } from '@/components/blufms/demo/DemoPlayer';
import { RightPanelContent } from '@/components/blufms/demo/RightPanelContent';
import { DetailsSlideIn } from '@/components/blufms/demo/DetailsSlideIn';
import { ComprehensiveReportView } from '@/components/blufms/demo/ComprehensiveReportView';
import { DemoScriptRunner } from '@/scripts/blufms/demoScriptRunner';
import { allDemoScripts } from '@/scripts/blufms';
import { DemoScript, CardData, MapLayer, TimelineMarker } from '@/scripts/blufms/demoActionTypes';
import { FacilityViewer3D } from '@/components/bludesign/viewer';
import * as bludesignApi from '@/api/bludesign';
import { useTheme } from '@/contexts/ThemeContext';

interface LayerTab {
  id: MapLayer;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mapLayers: LayerTab[] = [
  { id: 'network', label: 'Network', icon: SignalIcon },
  { id: 'security', label: 'Security', icon: ShieldCheckIcon },
  { id: 'heatmap', label: 'Heatmap', icon: FireIcon },
  { id: 'energy', label: 'Energy', icon: BoltIcon },
  { id: 'sensors', label: 'Sensors', icon: CpuChipIcon },
];

export default function BluFMSFacilityMapPage() {
  const { selectedFacility } = useBluFMSFacility();
  const { addToast } = useToast();
  const { effectiveTheme } = useTheme();
  const isDark = effectiveTheme === 'dark';
  const [activeLayer, setActiveLayer] = useState<MapLayer>('network');
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // BluDesign facility selection
  const [bluDesignFacilities, setBluDesignFacilities] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedBluDesignFacilityId, setSelectedBluDesignFacilityId] = useState<string | null>(null);
  const [isLoadingFacilities, setIsLoadingFacilities] = useState(false);
  
  // Demo system state
  const [cards, setCards] = useState<CardData[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<string | undefined>(undefined);
  const [currentScript, setCurrentScript] = useState<DemoScript | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isWorkflowComplete, setIsWorkflowComplete] = useState(false);
  const [reportGenerationProgress, setReportGenerationProgress] = useState<number | null>(null);
  
  // Details slide-in state
  const [detailsSlideInOpen, setDetailsSlideInOpen] = useState(false);
  const [detailsSlideInTitle, setDetailsSlideInTitle] = useState('');
  const [detailsSlideInContent, setDetailsSlideInContent] = useState<React.ReactNode>(null);
  
  // Full report state
  const [fullReportOpen, setFullReportOpen] = useState(false);
  const [fullReportTitle, setFullReportTitle] = useState('');
  const [fullReportType, setFullReportType] = useState<'morning-report' | 'security-incident' | 'pest-response' | 'occupancy'>('morning-report');
  
  // Ephemeral status cards (toast replacements)
  const [ephemeralCards, setEphemeralCards] = useState<Array<{ id: string; type: 'success' | 'info' | 'warning' | 'error'; title: string; message?: string }>>([]);
  
  const scriptRunnerRef = useRef<DemoScriptRunner | null>(null);

  // Load available BluDesign facilities
  useEffect(() => {
    const loadFacilities = async () => {
      setIsLoadingFacilities(true);
      try {
        const facilities = await bludesignApi.getFacilities();
        setBluDesignFacilities(facilities.map(f => ({ id: f.id, name: f.name })));
        
        // If selected facility has a linked 3D model, use it
        if (selectedFacility && (selectedFacility as any)?.bluDesignFacilityId) {
          setSelectedBluDesignFacilityId((selectedFacility as any).bluDesignFacilityId);
        } else if (facilities.length > 0) {
          // Otherwise, select the first available
          setSelectedBluDesignFacilityId(facilities[0].id);
        }
      } catch (error) {
        console.error('Failed to load BluDesign facilities:', error);
      } finally {
        setIsLoadingFacilities(false);
      }
    };
    
    loadFacilities();
  }, [selectedFacility]);

  // Initialize script runner
  useEffect(() => {
    const callbacks = {
      onCardAdded: (card: CardData) => {
        setCards(prev => [...prev, card]);
      },
      onCardUpdated: (cardId: string, updates: Partial<CardData>) => {
        setCards(prev => prev.map(card => {
          if (card.id === cardId) {
            // Handle timeline card updates specially
            if (card.type === 'timeline' && 'currentStep' in updates) {
              return { ...card, currentStep: (updates as any).currentStep };
            }
            return { ...card, ...updates };
          }
          return card;
        }));
      },
      onCardRemoved: (cardId: string) => {
        setCards(prev => prev.filter(card => card.id !== cardId));
      },
      onCardsCleared: () => {
        setCards([]);
      },
      onMapFilterChanged: (layer: MapLayer) => {
        handleLayerChange(layer);
      },
      onMapContentChanged: (content: string) => {
        // Map content changes can be handled here if needed
        console.log('Map content changed:', content);
      },
      onVoiceStatusUpdated: (status: string) => {
        setVoiceStatus(status);
      },
      onToastShown: (toast: any) => {
        // Only show critical toasts, others become ephemeral status cards
        if (toast.type === 'critical' || toast.type === 'error') {
          addToast(toast);
        } else {
          // Convert to ephemeral status card
          const id = `ephemeral-${Date.now()}-${Math.random()}`;
          setEphemeralCards(prev => [...prev, {
            id,
            type: toast.type === 'success' ? 'success' : toast.type === 'warning' ? 'warning' : 'info',
            title: toast.title,
            message: toast.message,
          }]);
        }
      },
      onEphemeralStatusAdded: (id: string, type: 'success' | 'info' | 'warning' | 'error', title: string, message?: string) => {
        setEphemeralCards(prev => [...prev, { id, type, title, message }]);
      },
      onTimelineShown: (visible: boolean) => {
        // Timeline is now handled via timeline cards
      },
      onTimelineUpdated: (markers: TimelineMarker[]) => {
        // Timeline is now handled via timeline cards
      },
      onTimelineStepSet: (step: number) => {
        // Update timeline cards when step changes
        setCards(prev => prev.map(card => {
          if (card.type === 'timeline') {
            return { ...card, currentStep: step };
          }
          return card;
        }));
      },
      onStepChanged: (step: number, total: number) => {
        setCurrentStep(step);
        setTotalSteps(total);
      },
      onReportGenerationProgress: (progress: number) => {
        setReportGenerationProgress(progress);
      },
      onChecklistItemUpdated: (cardId: string, itemId: string, completed: boolean, timestamp?: string) => {
        setCards(prev => prev.map(card => {
          if (card.id === cardId && card.type === 'checklist') {
            return {
              ...card,
              items: card.items.map(item =>
                item.id === itemId
                  ? { ...item, completed, timestamp }
                  : item
              )
            };
          }
          return card;
        }));
      },
      onScriptComplete: () => {
        setIsPlaying(false);
        setIsPaused(false);
        setReportGenerationProgress(100);
        setIsWorkflowComplete(true);
        // Don't clear currentScript - we need it to show the report button
      },
      onScriptError: (error: Error) => {
        console.error('Demo script error:', error);
        addToast({
          type: 'error',
          title: 'Demo Error',
          message: error.message,
        });
        setIsPlaying(false);
        setIsPaused(false);
      },
    };

    scriptRunnerRef.current = new DemoScriptRunner(callbacks);

    return () => {
      if (scriptRunnerRef.current) {
        scriptRunnerRef.current.stop();
      }
    };
  }, [addToast]);

  const handleLayerChange = useCallback((layer: MapLayer) => {
    if (layer === activeLayer || isTransitioning) return;
    
    setIsTransitioning(true);
    // Fade out and blur
    setTimeout(() => {
      setActiveLayer(layer);
      // Fade back in
      setTimeout(() => {
        setIsTransitioning(false);
      }, 100);
    }, 200);
  }, [activeLayer, isTransitioning]);

  const handlePlay = useCallback(async (script: DemoScript) => {
    if (!scriptRunnerRef.current) return;

    setCurrentScript(script);
    setCards([]);
    setVoiceStatus(undefined);
    setIsPlaying(true);
    setIsPaused(false);
    setIsWorkflowComplete(false);
    setReportGenerationProgress(null);
    setCurrentStep(0);
    setTotalSteps(script.actions.length);
    setDetailsSlideInOpen(false);
    setFullReportOpen(false);

    try {
      await scriptRunnerRef.current.runScript(script);
    } catch (error) {
      console.error('Failed to run script:', error);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (scriptRunnerRef.current) {
      scriptRunnerRef.current.pause();
      setIsPaused(true);
    }
  }, []);

  const handleResume = useCallback(() => {
    if (scriptRunnerRef.current) {
      scriptRunnerRef.current.resume();
      setIsPaused(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (scriptRunnerRef.current) {
      scriptRunnerRef.current.stop();
      setIsPlaying(false);
      setIsPaused(false);
      setIsWorkflowComplete(false);
      setReportGenerationProgress(null);
      setCurrentScript(null);
      setCurrentStep(0);
      setTotalSteps(0);
      setCards([]);
      setVoiceStatus(undefined);
    }
  }, []);

  const handleShowCardDetails = useCallback((cardId: string) => {
    const card = cards.find(c => c.id === cardId);
    if (card && card.type !== 'timeline') {
      if (card.type === 'detail' && card.detailsContent) {
        setDetailsSlideInTitle(card.title);
        setDetailsSlideInContent(card.detailsContent);
        setDetailsSlideInOpen(true);
      } else if ((card.type === 'security' || card.type === 'maintenance' || card.type === 'payments' || card.type === 'occupancy') && card.detailsContent) {
        setDetailsSlideInTitle(card.title);
        setDetailsSlideInContent(card.detailsContent);
        setDetailsSlideInOpen(true);
      }
    }
  }, [cards]);

  const handleViewWorkflowReport = useCallback((workflowId: string) => {
    const workflowReportMap: Record<string, { type: 'morning-report' | 'security-incident' | 'pest-response' | 'occupancy'; title: string }> = {
      'workflow0-login-facility': { type: 'morning-report', title: 'Login & Facility Wake-Up Report' },
      'workflow1-morning-report': { type: 'morning-report', title: 'Morning Shift Report' },
      'workflow2-security-incident': { type: 'security-incident', title: 'Security Incident Review Report' },
      'workflow3-pest-response': { type: 'pest-response', title: 'Pest Response Workflow Report' },
      'workflow4-occupancy-visualization': { type: 'occupancy', title: 'Occupancy Visualization Report' },
    };

    const reportConfig = workflowReportMap[workflowId];
    if (reportConfig) {
      setFullReportTitle(reportConfig.title);
      setFullReportType(reportConfig.type);
      setFullReportOpen(true);
    }
  }, []);

  const handleDismissEphemeral = useCallback((id: string) => {
    setEphemeralCards(prev => prev.filter(card => card.id !== id));
  }, []);

  const handleTimelineMarkerClick = useCallback((cardId: string, step: number) => {
    // Update the timeline card's current step
    setCards(prev => prev.map(card => {
      if (card.id === cardId && card.type === 'timeline') {
        return { ...card, currentStep: step };
      }
      return card;
    }));
  }, []);

  return (
    <div className="facility-map-page h-full flex flex-col bg-gray-50 dark:bg-gray-900 overflow-hidden relative" style={{ marginLeft: '-1.5rem', marginRight: '-1.5rem', width: 'calc(100% + 3rem)' }}>
      {/* Demo Player */}
      <DemoPlayer
        scripts={allDemoScripts}
        isPlaying={isPlaying}
        isPaused={isPaused}
        currentStep={currentStep}
        totalSteps={totalSteps}
        currentScript={currentScript}
        onPlay={handlePlay}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden gap-4 p-4">
        {/* Left Side - Map Area */}
        <div className="flex-1 flex flex-col relative min-h-0">
          {/* 3D Map Placeholder with rounded card */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm overflow-auto min-h-0 facility-map-card relative">
            {selectedFacility ? (
              <>
                {/* Floating Layer Tabs on Left Side */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-2">
                  {mapLayers.map((layer) => {
                    const Icon = layer.icon;
                    const isActive = activeLayer === layer.id;
                    return (
                      <button
                        key={layer.id}
                        onClick={() => handleLayerChange(layer.id)}
                        className={`
                          flex flex-col items-center gap-2 px-4 py-3 rounded-lg
                          transition-colors duration-200 ease-out
                          min-w-[80px] min-h-[80px]
                          border-2
                          ${
                            isActive
                              ? 'bg-primary-600 text-white shadow-lg border-primary-600'
                              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-gray-200 dark:border-gray-600'
                          }
                        `}
                        title={layer.label}
                        disabled={isTransitioning}
                      >
                        <Icon className={`h-7 w-7 flex-shrink-0 ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400'}`} />
                        <span className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                          {layer.label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Facility Selector - Top Right */}
                {bluDesignFacilities.length > 0 && (
                  <div className="absolute top-4 right-4 z-30">
                    <div className={`
                      flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-md shadow-lg border
                      ${isDark 
                        ? 'bg-gray-900/90 border-gray-700/60' 
                        : 'bg-white/90 border-gray-200/80'
                      }
                    `}>
                      <label className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                        3D Model:
                      </label>
                      <select
                        value={selectedBluDesignFacilityId || ''}
                        onChange={(e) => setSelectedBluDesignFacilityId(e.target.value || null)}
                        disabled={isLoadingFacilities}
                        className={`
                          text-sm px-2 py-1 rounded border
                          ${isDark 
                            ? 'bg-gray-800 border-gray-600 text-white' 
                            : 'bg-white border-gray-300 text-gray-900'
                          }
                          focus:outline-none focus:ring-2 focus:ring-primary-500
                        `}
                      >
                        {bluDesignFacilities.map((facility) => (
                          <option key={facility.id} value={facility.id}>
                            {facility.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Map Content */}
                <div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 min-h-full relative">
                  {/* 3D Facility Viewer - Show when a BluDesign facility is selected */}
                  {selectedBluDesignFacilityId ? (
                    <div className="absolute inset-0 z-0">
                      <FacilityViewer3D
                        bluDesignFacilityId={selectedBluDesignFacilityId}
                        bluLokFacilityId={selectedFacility?.id}
                        onReady={() => console.log('Facility 3D viewer ready')}
                        onError={(error) => console.error('Facility 3D viewer error:', error)}
                      />
                    </div>
                  ) : (
                    /* Placeholder Content - Show when no 3D model is linked */
                    <div className={`text-center transition-all duration-300 ease-in-out ${
                      isTransitioning ? 'opacity-0 blur-md scale-95' : 'opacity-100 blur-0 scale-100'
                    }`}>
                      <div className="mx-auto h-32 w-32 text-gray-400 dark:text-gray-500 mb-4 flex items-center justify-center">
                        <svg
                          className="w-full h-full"
                          viewBox="0 0 200 200"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          {/* Simple 3D isometric building representation */}
                          <path
                            d="M50 150 L100 100 L150 150 L100 200 Z"
                            fill="currentColor"
                            opacity="0.2"
                          />
                          <path
                            d="M100 100 L150 150 L150 200 L100 150 Z"
                            fill="currentColor"
                            opacity="0.3"
                          />
                          <path
                            d="M50 150 L100 100 L100 150 L50 200 Z"
                            fill="currentColor"
                            opacity="0.3"
                          />
                          <rect
                            x="60"
                            y="110"
                            width="30"
                            height="30"
                            fill="currentColor"
                            opacity="0.5"
                          />
                          <rect
                            x="110"
                            y="110"
                            width="30"
                            height="30"
                            fill="currentColor"
                            opacity="0.5"
                          />
                        </svg>
                      </div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        3D Facility Map - {mapLayers.find(l => l.id === activeLayer)?.label}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-md mx-auto">
                        Interactive 3D visualization for {selectedFacility.name} will be displayed here.
                      </p>
                      <div className="inline-flex items-center px-4 py-2 rounded-md bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <span className="text-xs font-medium text-blue-800 dark:text-blue-300">
                          Link a BluDesign 3D model to enable visualization
                        </span>
                      </div>
                    </div>
                  )}
                  
                  {/* Voice Chat Waveform - Centered in visualization area, always on top */}
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2" style={{ zIndex: 9999 }}>
                    <VoiceChatWaveform statusText={voiceStatus} />
                  </div>
                </div>
              </>
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div className="text-center">
                  <BuildingOfficeIcon className="mx-auto h-16 w-16 text-gray-400 dark:text-gray-500 mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Select a facility to view the map
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Sidebar - Status/Agentic Flow Cards with rounded card */}
        <div className="w-[23rem] flex flex-col min-h-0">
          <div className="flex-1 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-300 dark:border-gray-800 shadow-xl overflow-hidden min-h-0 facility-map-card">
            <div className="h-full flex flex-col p-4">
              <RightPanelContent
                cards={cards}
                ephemeralCards={ephemeralCards}
                currentWorkflow={currentScript?.id || null}
                isWorkflowComplete={isWorkflowComplete}
                reportGenerationProgress={reportGenerationProgress}
                onShowCardDetails={handleShowCardDetails}
                onViewWorkflowReport={handleViewWorkflowReport}
                onTimelineMarkerClick={handleTimelineMarkerClick}
                onDismissEphemeral={handleDismissEphemeral}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Details Slide-in */}
      <DetailsSlideIn
        isOpen={detailsSlideInOpen}
        onClose={() => setDetailsSlideInOpen(false)}
        title={detailsSlideInTitle}
      >
        {detailsSlideInContent}
      </DetailsSlideIn>

      {/* Comprehensive Report View */}
      <ComprehensiveReportView
        isOpen={fullReportOpen}
        onClose={() => setFullReportOpen(false)}
        title={fullReportTitle}
        reportType={fullReportType}
        facilityName={selectedFacility?.name}
      />
    </div>
  );
}

