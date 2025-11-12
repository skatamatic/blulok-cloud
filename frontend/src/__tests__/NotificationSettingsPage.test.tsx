import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationSettingsPage from '@/pages/NotificationSettingsPage';

// Mock ToastContext to capture toasts
const addToastMock = jest.fn();
jest.mock('@/contexts/ToastContext', () => {
  return {
    useToast: () => ({
      addToast: addToastMock,
      removeToast: jest.fn(),
      clearAllToasts: jest.fn(),
      toasts: [],
    }),
  };
});

// Mock api service
jest.mock('@/services/api.service', () => {
  return {
    apiService: {
      getNotificationSettings: jest.fn().mockResolvedValue({
        success: true,
        config: {
          enabledChannels: { sms: true, email: true },
          defaultProvider: { sms: 'console', email: 'console' },
          templates: {
            inviteSms: 'Welcome to BluLok. Tap to get started: {{deeplink}}',
            inviteEmail: 'Welcome to BluLok. Open {{deeplink}}',
            inviteEmailSubject: 'Your BluLok Invitation',
            otpSms: 'Your verification code is: {{code}}',
            otpEmail: 'Your verification code is: {{code}}',
            otpEmailSubject: 'Your Verification Code',
          },
          deeplinkBaseUrl: 'blulok://invite',
        },
      }),
      updateNotificationSettings: jest.fn(),
      sendTestNotifications: jest.fn(),
    },
  };
});

describe('NotificationSettingsPage - Send Test Notifications', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends test notifications and shows success toast with details', async () => {
    const { apiService } = await import('@/services/api.service');
    (apiService.sendTestNotifications as jest.Mock).mockResolvedValue({
      success: true,
      sent: ['sms_invite', 'email_invite', 'sms_otp', 'email_otp'],
      toEmail: 'test@example.com',
      toPhone: '+15551234567',
    });

    render(<NotificationSettingsPage />);

    // Wait for settings to load
    await waitFor(() => {
      expect(apiService.getNotificationSettings).toHaveBeenCalled();
    });

    // Click "Send Test Notifications"
    const btn = await screen.findByRole('button', { name: /send test notifications/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(apiService.sendTestNotifications).toHaveBeenCalledWith();
    });

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Test notifications dispatched',
          message: expect.stringContaining('sent: sms_invite, email_invite, sms_otp, email_otp'),
        })
      );
    });
  });

  it('shows error toast when sending tests fails', async () => {
    const { apiService } = await import('@/services/api.service');
    (apiService.sendTestNotifications as jest.Mock).mockRejectedValue(new Error('Network down'));

    render(<NotificationSettingsPage />);

    // Wait for settings to load
    await waitFor(() => {
      expect(apiService.getNotificationSettings).toHaveBeenCalled();
    });

    const btn = await screen.findByRole('button', { name: /send test notifications/i });
    await userEvent.click(btn);

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'error',
          title: 'Failed to send test notifications',
          message: 'Network down',
        })
      );
    });
  });
});


