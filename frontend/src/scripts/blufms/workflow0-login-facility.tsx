import { DemoScript } from './demoActionTypes';

export const workflow0LoginFacility: DemoScript = {
  id: 'workflow0-login-facility',
  name: 'Login & Facility Wake-Up',
  description: 'Operator login and facility wake-up sequence',
  actions: [
    { type: 'clearCards' },
    { type: 'updateVoiceStatus', status: 'Voice detected... authenticating user profile...' },
    { type: 'delay', duration: 500 },
    
    // Authentication Status card - appears immediately
    {
      type: 'addStatusCard',
      card: {
        id: 'auth-status',
        type: 'security',
        title: 'Authentication',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'blue',
        isLoading: true,
        loadingMessage: 'Authenticating user profile...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'auth-status', updates: { loadingProgress: 40 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'auth-status', updates: { loadingProgress: 80 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'auth-status', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'auth-status',
      updates: {
        isLoading: false,
        primaryValue: 'Authenticated',
        secondaryValue: 'Logged in as: Max Picton',
        badge: {
          text: 'Active',
          color: 'green',
        },
      },
    },
    { type: 'updateVoiceStatus', status: 'Good morning, Max. You are now logged in.' },
    { type: 'delay', duration: 1500 },
    { type: 'updateVoiceStatus', status: 'Bringing the facility online for daytime operations.' },
    { type: 'delay', duration: 500 },
    
    // System Wake-Up Checklist
    {
      type: 'addChecklistCard',
      card: {
        id: 'system-wakeup-checklist',
        type: 'checklist',
        title: 'System Wake-Up',
        items: [
          { id: 'cameras', label: 'Cameras operational', completed: false },
          { id: 'sensors', label: 'Sensors online', completed: false },
          { id: 'gate', label: 'Gate system connected', completed: false },
          { id: 'blulok', label: 'BluLok mesh network connected', completed: false },
          { id: 'ai', label: 'AI modules active', completed: false },
        ],
        completionMessage: 'System wake-up complete, all systems active',
        isLoading: true,
        loadingProgress: 0,
        loadingMessage: 'Loading wake-up todos...',
      },
    },
    { type: 'updateCard', cardId: 'system-wakeup-checklist', updates: { loadingProgress: 20, loadingMessage: 'Initializing system checks...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'system-wakeup-checklist', updates: { loadingProgress: 40, loadingMessage: 'Preparing diagnostics...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'system-wakeup-checklist', updates: { loadingProgress: 60, loadingMessage: 'Loading checklist items...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'system-wakeup-checklist', updates: { loadingProgress: 80, loadingMessage: 'Finalizing...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'system-wakeup-checklist', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 300 },
    {
      type: 'updateCard',
      cardId: 'system-wakeup-checklist',
      updates: {
        isLoading: false,
      },
    },
    { type: 'delay', duration: 300 },
    { type: 'updateChecklistItem', cardId: 'system-wakeup-checklist', itemId: 'cameras', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 600 },
    { type: 'updateChecklistItem', cardId: 'system-wakeup-checklist', itemId: 'sensors', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 600 },
    { type: 'updateChecklistItem', cardId: 'system-wakeup-checklist', itemId: 'gate', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 600 },
    { type: 'updateChecklistItem', cardId: 'system-wakeup-checklist', itemId: 'blulok', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 600 },
    { type: 'updateChecklistItem', cardId: 'system-wakeup-checklist', itemId: 'ai', completed: true, timestamp: 'Just now' },
    { type: 'updateVoiceStatus', status: 'The facility is ready for daytime operations. Would you like to begin with your morning shift report?' },
  ],
};

