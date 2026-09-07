/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TemplateVariablesModal } from '@/pages/settings/notifications/TemplateVariablesModal';

describe('TemplateVariablesModal', () => {
  it('lists template tokens and copies one on click', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(
      <TemplateVariablesModal isOpen onClose={jest.fn()} channel="email" />,
    );

    expect(screen.getByText('Template variables')).toBeInTheDocument();
    expect(screen.getByText(/Insert a token/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy {{facility_name}}' })).toBeInTheDocument();
    expect(screen.getByText('Email only')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Copy {{user_first_name}}' }));
    expect(writeText).toHaveBeenCalledWith('{{user_first_name}}');
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });
});
