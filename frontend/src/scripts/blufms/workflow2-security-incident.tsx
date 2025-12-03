import React from 'react';
import { DemoScript } from './demoActionTypes';

export const workflow2SecurityIncident: DemoScript = {
  id: 'workflow2-security-incident',
  name: 'Security Incident Review',
  description: 'Review overnight janitorial incident',
  actions: [
    { type: 'clearCards' },
    { type: 'changeMapFilter', layer: 'security' },
    { type: 'updateVoiceStatus', status: 'Showing security event details...' },
    { type: 'delay', duration: 500 },
    
    // Security Event Detail card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'security-event-detail',
        type: 'security',
        title: 'Security Event Details',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'red',
        isLoading: true,
        loadingMessage: 'Loading event details...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'security-event-detail', updates: { loadingProgress: 35 } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'security-event-detail', updates: { loadingProgress: 70 } },
    { type: 'delay', duration: 400 },
    { type: 'updateCard', cardId: 'security-event-detail', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 500 },
    {
      type: 'updateCard',
      cardId: 'security-event-detail',
      updates: {
        isLoading: false,
        primaryValue: 'Forced Entry Detected',
        secondaryValue: 'Unit 402 - Zone C',
        badge: {
          text: 'Priority High',
          color: 'red',
        },
        showDetails: true,
        detailsContent: (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trigger</div>
                <div className="font-medium text-gray-900 dark:text-white">Audible/Motion Sensor</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Time</div>
                <div className="font-medium text-gray-900 dark:text-white">11:46 PM</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Identified</div>
                <div className="font-medium text-gray-900 dark:text-white">Janitorial Staff</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Status</div>
                <div className="font-medium text-green-600 dark:text-green-400">Secure</div>
              </div>
            </div>
            <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Additional Details</div>
              <div className="space-y-1 text-xs">
                <div><span className="font-medium">Scheduled Zone: </span>Maintenance Wing</div>
                <div><span className="font-medium">Actual Zone: </span>Upper Hallway – Zone C</div>
                <div><span className="font-medium">Access Attempts: </span>0</div>
                <div><span className="font-medium">Lock Scan: </span>Completed</div>
              </div>
            </div>
          </div>
        ),
      },
    },
    { type: 'delay', duration: 1000 },
    {
      type: 'addTimelineCard',
      card: {
        id: 'security-timeline',
        type: 'timeline',
        markers: [
          { id: 'step1', label: 'Sensor Trigger', timestamp: '11:46 PM', step: 1 },
          { id: 'step2', label: 'Identity Confirmed', timestamp: '11:46 PM', step: 2 },
          { id: 'step3', label: 'Lock Scan Complete', timestamp: '11:47 PM', step: 3 },
          { id: 'step4', label: 'Entry/Exit Tracked', timestamp: '11:46-11:59 PM', step: 4 },
          { id: 'step5', label: 'Video Captured', timestamp: '11:46 PM', step: 5 },
          { id: 'step6', label: 'Event Classified', timestamp: '11:59 PM', step: 6 },
        ],
        currentStep: 1,
      },
    },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 1 },
    { type: 'delay', duration: 1500 },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 2 },
    { type: 'delay', duration: 1500 },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 3 },
    
    // Lock Scan Results card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'lock-scan-results',
        type: 'security',
        title: 'Lock Scan Results',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'green',
        isLoading: true,
        loadingMessage: 'Scanning locks...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'lock-scan-results', updates: { loadingProgress: 40 } },
    { type: 'delay', duration: 500 },
    { type: 'updateCard', cardId: 'lock-scan-results', updates: { loadingProgress: 80 } },
    { type: 'delay', duration: 500 },
    {
      type: 'updateCard',
      cardId: 'lock-scan-results',
      updates: {
        isLoading: false,
        primaryValue: 'All Secure',
        secondaryValue: '18 Units checked, 0 unauthorized attempts',
        showDetails: true,
        detailsContent: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Units Checked</span>
              <span className="font-semibold text-gray-900 dark:text-white">18</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Unauthorized Attempts</span>
              <span className="font-semibold text-green-600 dark:text-green-400">0</span>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs font-medium text-green-600 dark:text-green-400">All locks secured: Yes</div>
            </div>
          </div>
        ),
      },
    },
    { type: 'delay', duration: 1500 },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 4 },
    { type: 'delay', duration: 1500 },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 5 },
    { type: 'delay', duration: 1500 },
    { type: 'updateTimelineCard', cardId: 'security-timeline', currentStep: 6 },
    
    // Event Classification card - loading then loaded
    {
      type: 'addStatusCard',
      card: {
        id: 'event-classification',
        type: 'security',
        title: 'Event Classification',
        primaryValue: '',
        secondaryValue: '',
        statusColor: 'yellow',
        isLoading: true,
        loadingMessage: 'Classifying event...',
        loadingProgress: 0,
        hasSignificantDetails: true,
      },
    },
    { type: 'updateCard', cardId: 'event-classification', updates: { loadingProgress: 50 } },
    { type: 'delay', duration: 600 },
    { type: 'updateCard', cardId: 'event-classification', updates: { loadingProgress: 100 } },
    { type: 'delay', duration: 400 },
    {
      type: 'updateCard',
      cardId: 'event-classification',
      updates: {
        isLoading: false,
        primaryValue: 'Low Severity',
        secondaryValue: 'Unscheduled Cleaning Activity',
        showDetails: true,
        detailsContent: (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Type</div>
                <div className="font-medium text-gray-900 dark:text-white">Unscheduled Cleaning</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Severity</div>
                <div className="font-medium text-yellow-600 dark:text-yellow-400">Low</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Unauthorized Access</div>
                <div className="font-medium text-green-600 dark:text-green-400">None</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Evidence</div>
                <div className="font-medium text-gray-900 dark:text-white">Complete</div>
              </div>
            </div>
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700 mt-2">
              <div className="text-xs text-gray-600 dark:text-gray-400">Sensor logs, identity match, video recording</div>
            </div>
          </div>
        ),
      },
    },
    { type: 'delay', duration: 1000 },
    { type: 'updateVoiceStatus', status: 'Would you like me to notify the cleaning company that their staff entered an unscheduled area last night?' },
    { type: 'delay', duration: 2000 },
    {
      type: 'addMessageCard',
      card: {
        id: 'notification-email',
        type: 'message',
        messageType: 'email',
        subject: 'Unscheduled Cleaning Activity Recorded',
        to: 'cleaning@example.com',
        from: 'blufms@blulok.com',
        body: 'Hi,\n\nBluFMS detected cleaning activity last night in a non-assigned area. No access issues occurred, but please remind your staff to stay within scheduled zones.\n\nTimestamped footage and logs are available on request.\n\nThank you.',
        status: 'sent',
        timestamp: 'Just now',
      },
    },
    { type: 'delay', duration: 1000 },
    { type: 'addEphemeralStatus', id: 'email-sent', type: 'success', title: 'Email Sent', message: 'Notification sent to cleaning company.' },
    { type: 'updateVoiceStatus', status: 'Notification sent to the cleaning company.' },
  ],
};

