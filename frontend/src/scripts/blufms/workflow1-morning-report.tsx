import { DemoScript } from './demoActionTypes';

export const workflow1MorningReport: DemoScript = {
  id: 'workflow1-morning-report',
  name: 'Morning Shift Report',
  description: 'Generate and review morning shift report',
  actions: [
    { type: 'updateVoiceStatus', status: 'Generating your morning shift report...' },
    { type: 'delay', duration: 800 },
    
    // Security card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'security-card',
        type: 'security',
        title: 'Security',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'orange',
        isLoading: true,
        loadingMessage: 'Checking security events...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'security-card', updates: { loadingProgress: 30 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'security-card', updates: { loadingProgress: 70 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'security-card', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'security-card',
      updates: {
        isLoading: false,
        primaryValue: '1 Overnight Event',
        secondaryValue: 'Unscheduled activity detected in Upper Hallway – Zone C',
        badge: {
          text: '1 Active',
          color: 'orange',
        },
        showDetails: true,
        detailsContent: (
          <div className="space-y-2 text-sm">
            <div><span className="font-medium">Status: </span><span className="text-green-600 dark:text-green-400">Resolved, no unauthorized access</span></div>
            <div><span className="font-medium">Location: </span>Upper Hallway – Zone C</div>
            <div><span className="font-medium">Time: </span>11:46 PM</div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">Details available for review in security event log.</div>
            </div>
          </div>
        ),
      },
    },
    
    // Maintenance card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'maintenance-card',
        type: 'maintenance',
        title: 'Maintenance',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'yellow',
        isLoading: true,
        loadingMessage: 'Reviewing work orders...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'maintenance-card', updates: { loadingProgress: 25 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'maintenance-card', updates: { loadingProgress: 55 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'maintenance-card', updates: { loadingProgress: 85 } },
    { type: 'delay', duration: 700 },
    {
      type: 'updateCard',
      cardId: 'maintenance-card',
      updates: {
        isLoading: false,
        primaryValue: '2 Open Work Orders',
        secondaryValue: '1 Completed Yesterday, 1 Overdue',
        badge: {
          text: '1 Overdue',
          color: 'orange',
        },
        showDetails: true,
        detailsContent: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Open Work Orders</span>
              <span className="font-semibold text-gray-900 dark:text-white">2</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Completed Yesterday</span>
              <span className="text-green-600 dark:text-green-400 font-semibold">1</span>
            </div>
            <div className="flex items-center justify-between text-orange-600 dark:text-orange-400">
              <span>Overdue</span>
              <span className="font-semibold">1</span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs font-medium text-orange-600 dark:text-orange-400">Door seal inspection – Unit 207 (1 day overdue)</div>
            </div>
          </div>
        ),
      },
    },
    
    // Payments card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'payments-card',
        type: 'payments',
        title: 'Payments',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'blue',
        isLoading: true,
        loadingMessage: 'Processing payment data...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'payments-card', updates: { loadingProgress: 40 } },
    { type: 'delay', duration: 300 },
    { type: 'updateCard', cardId: 'payments-card', updates: { loadingProgress: 80 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'payments-card',
      updates: {
        isLoading: false,
        primaryValue: '24 Processed',
        secondaryValue: '18 Online, 6 On-site',
        badge: {
          text: '2 Failed',
          color: 'red',
        },
        showDetails: true,
      },
    },
    
    // Occupancy card - loading then loaded (includes move-ins/move-outs)
    {
      type: 'addStatusCard',
      card: {
        id: 'occupancy-card',
        type: 'occupancy',
        title: 'Occupancy',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'blue',
        isLoading: true,
        loadingMessage: 'Calculating occupancy and move-ins...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'occupancy-card', updates: { loadingProgress: 20 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'occupancy-card', updates: { loadingProgress: 50 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'occupancy-card', updates: { loadingProgress: 80 } },
    { type: 'delay', duration: 700 },
    {
      type: 'updateCard',
      cardId: 'occupancy-card',
      updates: {
        isLoading: false,
        primaryValue: '92%',
        secondaryValue: '44 Vacant • 3 Move-ins Today',
        showDetails: true,
        detailsContent: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Overall Occupancy</span>
              <span className="font-semibold text-gray-900 dark:text-white">92%</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Vacant Units</span>
              <span className="font-semibold text-gray-900 dark:text-white">44</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Today's Activity</span>
              <span className="font-semibold text-gray-900 dark:text-white">3 Move-ins, 1 Move-out</span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">AI forecast: 94% occupancy projected for next 30 days</div>
            </div>
          </div>
        ),
      },
    },
    
    // BluLok Network card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'blulok-network-card',
        type: 'blulok-network',
        title: 'BluLok Network',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'green',
        isLoading: true,
        loadingMessage: 'Scanning network nodes...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'blulok-network-card', updates: { loadingProgress: 35 } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'blulok-network-card', updates: { loadingProgress: 70 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'blulok-network-card', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'blulok-network-card',
      updates: {
        isLoading: false,
        primaryValue: 'All Online',
        secondaryValue: '84/84 Nodes active',
        showDetails: true,
      },
    },
    { type: 'updateVoiceStatus', status: 'Morning shift report complete. You have one overnight event that may require review, one overdue work order, and two failed payments flagged for follow-up.' },
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

