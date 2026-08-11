import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning';
export type ButtonSize = 'sm' | 'md';

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  warning: 'btn-warning',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

/**
 * Themed button — use instead of raw `<button>` for primary actions so global dark-mode
 * base styles do not override label colors.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', type = 'button', ...props }, ref) => {
    const classes = [variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(' ');
    return <button ref={ref} type={type} className={classes} {...props} />;
  },
);

Button.displayName = 'Button';
