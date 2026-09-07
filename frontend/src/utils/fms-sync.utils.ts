import { AxiosError } from 'axios';

export class FMSSyncInProgressError extends Error {
  constructor(message = 'A sync operation is already in progress for this facility') {
    super(message);
    this.name = 'FMSSyncInProgressError';
  }
}

export function isFMSSyncInProgressError(error: unknown): boolean {
  if (error instanceof FMSSyncInProgressError) {
    return true;
  }
  const axiosError = error as AxiosError<{ message?: string }>;
  return axiosError.response?.status === 409;
}
