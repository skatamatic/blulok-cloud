import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NotificationSettingsPage from '@/pages/settings/NotificationsSettingsTab';

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

async function fillTestRecipients() {
  await userEvent.type(screen.getByPlaceholderText('you@example.com'), 'test@example.com');
  await userEvent.type(screen.getByPlaceholderText('+15551234567'), '+15551234567');
}

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

    await waitFor(() => {
      expect(apiService.getNotificationSettings).toHaveBeenCalled();
    });

    const openBtn = await screen.findByRole('button', { name: /send test notifications/i });
    await userEvent.click(openBtn);

    const confirmBtn = await screen.findByRole('button', { name: /send tests/i });
    expect(confirmBtn).toBeDisabled();

    await fillTestRecipients();
    expect(confirmBtn).toBeEnabled();
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiService.sendTestNotifications).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(addToastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'success',
          title: 'Test notifications result',
          message: expect.stringContaining('Sent: sms_invite, email_invite, sms_otp, email_otp'),
        })
      );
    });
  });

  it('shows error toast when sending tests fails', async () => {
    const { apiService } = await import('@/services/api.service');
    (apiService.sendTestNotifications as jest.Mock).mockRejectedValue(new Error('Network down'));

    render(<NotificationSettingsPage />);

    await waitFor(() => {
      expect(apiService.getNotificationSettings).toHaveBeenCalled();
    });

    const openBtn = await screen.findByRole('button', { name: /send test notifications/i });
    await userEvent.click(openBtn);

    await fillTestRecipients();
    const confirmBtn = await screen.findByRole('button', { name: /send tests/i });
    await userEvent.click(confirmBtn);

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
