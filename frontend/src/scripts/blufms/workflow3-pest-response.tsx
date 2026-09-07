import { DemoScript } from './demoActionTypes';

export const workflow3PestResponse: DemoScript = {
  id: 'workflow3-pest-response',
  name: 'Pest Response Workflow',
  description: 'Automated pest response workflow execution',
  actions: [
    { type: 'clearCards' },
    { type: 'updateVoiceStatus', status: 'Issue detected in Unit 10. Running Pest Response Workflow...' },
    { type: 'delay', duration: 500 },
    
    // Work Order card - loading then loaded
    {
      type: 'addWorkOrderCard',
      card: {
        id: 'workorder-237',
        type: 'workorder',
        workOrderNumber: '237',
        issue: '',
        unit: '',
        priority: 'medium',
        status: 'open',
        isLoading: true,
        loadingMessage: 'Creating work order...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'workorder-237', updates: { loadingProgress: 50 } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'workorder-237', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 300 },
    {
      type: 'updateCard',
      cardId: 'workorder-237',
      updates: {
        isLoading: false,
        issue: 'Pest activity',
        unit: '10',
        assignedTo: 'Pest Control Vendor',
        dueDate: 'Today',
      } as any,
    },
    // Pest Response Workflow Checklist
    {
      type: 'addChecklistCard',
      card: {
        id: 'pest-workflow-checklist',
        type: 'checklist',
        title: 'Pest Response Workflow',
        items: [
          { id: 'workorder', label: 'Work order #237 created', completed: true },
          { id: 'tenant-notify', label: 'Tenant notified', completed: false },
          { id: 'vendor-contact', label: 'Vendor contacted', completed: false },
          { id: 'access-window', label: 'Access window created', completed: false },
          { id: 'treatment', label: 'Treatment completed', completed: false },
          { id: 'workorder-close', label: 'Work order closed', completed: false },
        ],
        completionMessage: 'Pest response workflow complete',
        isLoading: true,
        loadingProgress: 0,
        loadingMessage: 'Loading workflow checklist...',
      },
    },
    { type: 'updateCard', cardId: 'pest-workflow-checklist', updates: { loadingProgress: 30, loadingMessage: 'Initializing workflow...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'pest-workflow-checklist', updates: { loadingProgress: 60, loadingMessage: 'Loading checklist items...' } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'pest-workflow-checklist', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 300 },
    {
      type: 'updateCard',
      cardId: 'pest-workflow-checklist',
      updates: {
        isLoading: false,
      },
    },
    { type: 'delay', duration: 300 },
    
    // Tenant notification - loading then loaded
    {
      type: 'addMessageCard',
      card: {
        id: 'tenant-notification',
        type: 'message',
        messageType: 'sms',
        to: '+1 (555) 123-4567',
        body: '',
        isLoading: true,
        loadingMessage: 'Sending notification...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'tenant-notification', updates: { loadingProgress: 50 } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'tenant-notification', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 300 },
    {
      type: 'updateCard',
      cardId: 'tenant-notification',
      updates: {
        isLoading: false,
        body: 'Hi, We detected a possible pest issue in your unit (Unit 10). We\'re dispatching pest control today to inspect and resolve the concern. You do not need to be present. Thank you.',
        status: 'sent',
        timestamp: 'Just now',
      },
    },
    { type: 'updateChecklistItem', cardId: 'pest-workflow-checklist', itemId: 'tenant-notify', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 1500 },
    
    // Vendor request - loading then loaded
    {
      type: 'addMessageCard',
      card: {
        id: 'vendor-request',
        type: 'message',
        messageType: 'email',
        subject: 'Service Request: Pest concern in Unit 10',
        to: 'pestcontrol@example.com',
        body: '',
        isLoading: true,
        loadingMessage: 'Sending email...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'vendor-request', updates: { loadingProgress: 40 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'vendor-request', updates: { loadingProgress: 80 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'vendor-request', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'vendor-request',
      updates: {
        isLoading: false,
        body: 'Please reply with your earliest available time for dispatch today.',
        status: 'sent',
      },
    },
    { type: 'delay', duration: 2000 },
    
    // Vendor reply - loading then loaded
    {
      type: 'addMessageCard',
      card: {
        id: 'vendor-reply',
        type: 'message',
        messageType: 'email',
        subject: 'Re: Service Request: Pest concern in Unit 10',
        to: 'blufms@blulok.com',
        from: 'pestcontrol@example.com',
        body: '',
        isLoading: true,
        loadingMessage: 'Receiving reply...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'vendor-reply', updates: { loadingProgress: 30 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'vendor-reply', updates: { loadingProgress: 70 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'vendor-reply', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'vendor-reply',
      updates: {
        isLoading: false,
        body: 'We can be there today at 3:30 PM.',
        status: 'sent',
        timestamp: '2 minutes ago',
      },
    },
    { type: 'delay', duration: 1000 },
    
    // Appointment booked - loading then loaded
    {
      type: 'addDetailCard',
      card: {
        id: 'appointment-booked',
        type: 'detail',
        title: 'Appointment Booked',
        content: null,
        isLoading: true,
        loadingMessage: 'Creating access window...',
        loadingProgress: 0,
      },
    },
    { type: 'updateCard', cardId: 'appointment-booked', updates: { loadingProgress: 50 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'appointment-booked', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'appointment-booked',
      updates: {
        isLoading: false,
        content: (
          <div className="space-y-2 text-sm">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Today at 3:30 PM</div>
            <div>Vendor: Okanagan Pest Solutions</div>
            <div className="text-green-600 dark:text-green-400 mt-2">Timed access configured: 3:00 PM - 4:30 PM</div>
          </div>
        ),
      },
    },
    { type: 'updateChecklistItem', cardId: 'pest-workflow-checklist', itemId: 'vendor-contact', completed: true, timestamp: 'Just now' },
    { type: 'updateChecklistItem', cardId: 'pest-workflow-checklist', itemId: 'access-window', completed: true, timestamp: 'Just now' },
    { type: 'delay', duration: 2000 },
    { type: 'updateVoiceStatus', status: 'Contractor arrival confirmed. Device ID verified. Entry logged at 3:30 PM.' },
    { type: 'delay', duration: 1500 },
    
    // Pest Inspection card - with video
    {
      type: 'addStatusCard',
      card: {
        id: 'pest-inspection',
        type: 'maintenance',
        title: 'Pest Inspection',
        primaryValue: 'In Progress',
        secondaryValue: 'Unit 10 - Treatment in progress',
        statusColor: 'blue',
        videoUrl: '/demo-videos/security_incident_demo2.mp4',
        hasSignificantDetails: true,
      },
    },
    {
      type: 'updateCard',
      cardId: 'workorder-237',
      updates: {
        status: 'in-progress',
      } as any,
    },
    { type: 'delay', duration: 2000 },
    {
      type: 'updateCard',
      cardId: 'workorder-237',
      updates: {
        status: 'completed',
        completionEvidence: {
          timestamp: '3:47 PM',
          notes: 'Treatment applied. Unit cleared.',
        },
      } as any,
    },
    {
      type: 'updateCard',
      cardId: 'pest-inspection',
      updates: {
        primaryValue: 'Treatment Complete',
        secondaryValue: 'Unit 10 - Inspection and treatment finished',
        statusColor: 'green',
        badge: {
          text: 'Completed',
          color: 'green',
        },
      },
    },
    { type: 'delay', duration: 1000 },
    {
      type: 'updateCard',
      cardId: 'workorder-237',
      updates: {
        status: 'closed',
      } as any,
    },
    { type: 'updateChecklistItem', cardId: 'pest-workflow-checklist', itemId: 'treatment', completed: true, timestamp: '3:47 PM' },
    { type: 'delay', duration: 1000 },
    { type: 'updateChecklistItem', cardId: 'pest-workflow-checklist', itemId: 'workorder-close', completed: true, timestamp: 'Just now' },
    { type: 'updateVoiceStatus', status: 'The Pest Response Workflow is complete. Work order closed and updated in reports.' },
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

