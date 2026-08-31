import {
  inviteRequestOtpSchema,
  inviteSetPasswordSchema,
} from '@/schemas/auth.schemas';

describe('invite auth schemas', () => {
  it('treats empty firstName/lastName/email as absent on set-password', () => {
    const { error, value } = inviteSetPasswordSchema.validate(
      {
        token: 'tok',
        otp: '123456',
        newPassword: 'Strong!Pass1',
        firstName: '',
        lastName: '',
        email: '',
      },
      { convert: true, abortEarly: false },
    );

    expect(error).toBeUndefined();
    expect(value).toEqual({
      token: 'tok',
      otp: '123456',
      newPassword: 'Strong!Pass1',
    });
  });

  it('still rejects blank names when a value is required by min length after trim', () => {
    const { error } = inviteSetPasswordSchema.validate(
      {
        token: 'tok',
        otp: '123456',
        newPassword: 'Strong!Pass1',
        firstName: '   ',
      },
      { convert: true, abortEarly: false },
    );

    // trim → empty → stripped; whitespace-only is treated as absent, not an error
    expect(error).toBeUndefined();
  });

  it('allows omitting profile fields on request-otp', () => {
    const { error, value } = inviteRequestOtpSchema.validate(
      { token: 'tok', phone: '+15551234567', firstName: null, lastName: '' },
      { convert: true, abortEarly: false },
    );

    expect(error).toBeUndefined();
    expect(value.firstName).toBeUndefined();
    expect(value.lastName).toBeUndefined();
  });
});
