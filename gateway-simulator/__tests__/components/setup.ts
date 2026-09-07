import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  if (typeof document === 'undefined') return;
  cleanup();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});
