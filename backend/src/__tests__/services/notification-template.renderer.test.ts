import { renderTemplate } from '@/services/notifications/notification-template.renderer';

describe('renderTemplate', () => {
  it('replaces placeholders', () => {
    expect(renderTemplate('Hi {{name}}, code {{code}}', { name: 'Ada', code: '123' })).toBe(
      'Hi Ada, code 123',
    );
  });

  it('replaces missing vars with empty string when key is provided', () => {
    expect(renderTemplate('code={{code}}', { code: undefined })).toBe('code=');
  });
});
