import React from 'react';
import { DemoScript } from './demoActionTypes';

export const workflow0LoginFacility: DemoScript = {
  id: 'workflow0-login-facility',
  name: 'Login & Facility Wake-Up',
  description: 'Operator login and facility wake-up sequence',
  actions: [
    { type: 'clearCards' },
    { type: 'updateVoiceStatus', status: 'Voice detected... authenticating user profile...' },
    { type: 'delay', duration: 2000 },
    { type: 'addEphemeralStatus', id: 'auth-success', type: 'success', title: 'Voice Authentication Successful', message: 'Logged in as: Max Picton' },
    { type: 'updateVoiceStatus', status: 'Good morning, Max. You are now logged in.' },
    { type: 'delay', duration: 1500 },
    { type: 'updateVoiceStatus', status: 'Bringing the facility online for daytime operations.' },
    { type: 'delay', duration: 1000 },
    { type: 'addEphemeralStatus', id: 'diagnostics-start', type: 'info', title: 'Running morning diagnostics...' },
    { type: 'delay', duration: 800 },
    { type: 'addEphemeralStatus', id: 'cameras-online', type: 'success', title: 'Cameras operational' },
    { type: 'delay', duration: 600 },
    { type: 'addEphemeralStatus', id: 'sensors-online', type: 'success', title: 'Sensors online' },
    { type: 'delay', duration: 600 },
    { type: 'addEphemeralStatus', id: 'gate-connected', type: 'success', title: 'Gate system connected' },
    { type: 'delay', duration: 600 },
    { type: 'addEphemeralStatus', id: 'blulok-connected', type: 'success', title: 'BluLok mesh network connected' },
    { type: 'delay', duration: 600 },
    { type: 'addEphemeralStatus', id: 'ai-active', type: 'success', title: 'AI modules active' },
    { type: 'delay', duration: 800 },
    { type: 'addEphemeralStatus', id: 'diagnostics-complete', type: 'success', title: 'Diagnostics complete', message: 'All systems online' },
    { type: 'updateVoiceStatus', status: 'The facility is ready for daytime operations. Would you like to begin with your morning shift report?' },
    { type: 'delay', duration: 2000 },
    {
      type: 'addDetailCard',
      card: {
        id: 'system-status',
        type: 'detail',
        title: 'System Status',
        content: (
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span>Lighting</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Active</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Climate Control</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Day Mode</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Security System</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Day Mode</span>
            </div>
            <div className="flex items-center justify-between">
              <span>BluLok Network</span>
              <span className="text-green-600 dark:text-green-400 font-medium">Online</span>
            </div>
          </div>
        ),
      },
    },
  ],
};

