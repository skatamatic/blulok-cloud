import React from 'react';
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
    { type: 'addEphemeralStatus', id: 'workorder-created', type: 'success', title: 'Work Order Created', message: 'Work order #237 has been created.' },
    { type: 'delay', duration: 1000 },
    {
      type: 'addMessageCard',
      card: {
        id: 'tenant-notification',
        type: 'message',
        messageType: 'sms',
        to: '+1 (555) 123-4567',
        body: 'Hi, We detected a possible pest issue in your unit (Unit 10). We\'re dispatching pest control today to inspect and resolve the concern. You do not need to be present. Thank you.',
        status: 'sent',
        timestamp: 'Just now',
      },
    },
    { type: 'addEphemeralStatus', id: 'tenant-notified', type: 'success', title: 'Tenant Notified', message: 'The tenant has been notified.' },
    { type: 'delay', duration: 1500 },
    {
      type: 'addMessageCard',
      card: {
        id: 'vendor-request',
        type: 'message',
        messageType: 'email',
        subject: 'Service Request: Pest concern in Unit 10',
        to: 'pestcontrol@example.com',
        body: 'Please reply with your earliest available time for dispatch today.',
        status: 'sent',
      },
    },
    { type: 'delay', duration: 2000 },
    {
      type: 'addMessageCard',
      card: {
        id: 'vendor-reply',
        type: 'message',
        messageType: 'email',
        subject: 'Re: Service Request: Pest concern in Unit 10',
        to: 'blufms@blulok.com',
        from: 'pestcontrol@example.com',
        body: 'We can be there today at 3:30 PM.',
        status: 'sent',
        timestamp: '2 minutes ago',
      },
    },
    { type: 'delay', duration: 1000 },
    {
      type: 'addDetailCard',
      card: {
        id: 'appointment-booked',
        type: 'detail',
        title: 'Appointment Booked',
        content: (
          <div className="space-y-2 text-sm">
            <div className="text-lg font-semibold text-gray-900 dark:text-white">Today at 3:30 PM</div>
            <div>Vendor: Okanagan Pest Solutions</div>
            <div className="text-green-600 dark:text-green-400 mt-2">Timed access configured: 3:00 PM - 4:30 PM</div>
          </div>
        ),
      },
    },
    { type: 'addEphemeralStatus', id: 'access-window-created', type: 'success', title: 'Access Window Created', message: 'Timed access set for contractor from 3:00 to 4:30 PM.' },
    { type: 'delay', duration: 2000 },
    { type: 'updateVoiceStatus', status: 'Contractor arrival confirmed. Device ID verified. Entry logged at 3:30 PM.' },
    { type: 'delay', duration: 1500 },
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
    { type: 'delay', duration: 1000 },
    {
      type: 'updateCard',
      cardId: 'workorder-237',
      updates: {
        status: 'closed',
      } as any,
    },
    { type: 'addEphemeralStatus', id: 'workorder-closed', type: 'success', title: 'Work Order Closed', message: 'Work order #237 has been closed and updated in reports.' },
    { type: 'updateVoiceStatus', status: 'The Pest Response Workflow is complete. Work order closed and updated in reports.' },
  ],
};

