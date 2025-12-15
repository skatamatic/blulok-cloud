import { DemoScript } from './demoActionTypes';

export const workflow4OccupancyVisualization: DemoScript = {
  id: 'workflow4-occupancy-visualization',
  name: 'Occupancy Visualization',
  description: 'View vacant units and occupancy reports',
  actions: [
    { type: 'clearCards' },
    { type: 'changeMapFilter', layer: 'heatmap' },
    { type: 'updateVoiceStatus', status: 'Showing all vacant units on Floor 2...' },
    { type: 'delay', duration: 500 },
    
    // Floor 2 Overview card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'floor2-overview',
        type: 'occupancy',
        title: 'Floor 2 – Vacancy Overview',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'green',
        isLoading: true,
        loadingMessage: 'Analyzing floor occupancy...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'floor2-overview', updates: { loadingProgress: 30 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'floor2-overview', updates: { loadingProgress: 65 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'floor2-overview', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 500 },
    {
      type: 'updateCard',
      cardId: 'floor2-overview',
      updates: {
        isLoading: false,
        primaryValue: '14 Vacant',
        secondaryValue: '80% Occupancy (72 Total Units)',
        showDetails: true,
        detailsContent: (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Total Units</div>
                <div className="font-semibold text-gray-900 dark:text-white">72</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Vacant Units</div>
                <div className="font-semibold text-green-600 dark:text-green-400">14</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Occupancy</div>
                <div className="font-semibold text-gray-900 dark:text-white">80%</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Avg Vacancy Duration</div>
                <div className="font-semibold text-gray-900 dark:text-white">18 days</div>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-600 dark:text-gray-400">AI forecast (30 days): 86% occupancy</div>
            </div>
          </div>
        ),
      },
    },
    { type: 'delay', duration: 2000 },
    { type: 'updateVoiceStatus', status: 'Generating occupancy report for the last three months...' },
    { type: 'delay', duration: 800 },
    
    // Occupancy Report card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'occupancy-report',
        type: 'occupancy',
        title: '3-Month Occupancy Report',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'green',
        isLoading: true,
        loadingMessage: 'Generating report...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'occupancy-report', updates: { loadingProgress: 25 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'occupancy-report', updates: { loadingProgress: 55 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'occupancy-report', updates: { loadingProgress: 85 } },
    { type: 'delay', duration: 500 },
    {
      type: 'updateCard',
      cardId: 'occupancy-report',
      updates: {
        isLoading: false,
        primaryValue: '+27 Net Growth',
        secondaryValue: '78 Move-ins, 51 Move-outs',
        showDetails: true,
        detailsContent: (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-2 bg-blue-50 dark:bg-blue-900/20 rounded">
                <div className="text-xl font-bold text-gray-900 dark:text-white">78</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Move-ins</div>
              </div>
              <div className="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
                <div className="text-xl font-bold text-gray-900 dark:text-white">51</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Move-outs</div>
              </div>
              <div className="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded">
                <div className="text-xl font-bold text-green-600 dark:text-green-400">+27</div>
                <div className="text-xs text-gray-600 dark:text-gray-400">Net growth</div>
              </div>
            </div>
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <div className="text-sm font-medium text-blue-800 dark:text-blue-300">
                Seasonal pattern detected: Q2 historically outperforms Q3 by 8%
              </div>
            </div>
          </div>
        ),
      },
    },
    { type: 'delay', duration: 1000 },
    { type: 'updateVoiceStatus', status: 'Your facility grew by twenty-seven net occupied units over the last three months.' },
    { type: 'delay', duration: 800 },
    { type: 'updateVoiceStatus', status: 'Generating comprehensive report...' },
    { type: 'updateReportGenerationProgress', progress: 10 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 30 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 50 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 70 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 85 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 95 },
    { type: 'delay', duration: 400 },
    { type: 'updateReportGenerationProgress', progress: 100 },
  ],
};

