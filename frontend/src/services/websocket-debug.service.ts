import { ToastType } from '@/types/toast.types';

interface WebSocketDebugService {
  showDebugToast: (type: ToastType, title: string, message: string) => void;
  isDebugEnabled: () => boolean;
  setDebugEnabled: (enabled: boolean) => void;
}

class WebSocketDebugServiceImpl implements WebSocketDebugService {
  private debugEnabled = false;
  private toastCallback: ((toast: { type: ToastType; title: string; message: string }) => void) | null = null;

  public setToastCallback(callback: (toast: { type: ToastType; title: string; message: string }) => void) {
    this.toastCallback = callback;
  }

  public showDebugToast(type: ToastType, title: string, message: string) {
    if (this.debugEnabled && this.toastCallback) {
      this.toastCallback({ type, title, message });
    }
  }

  public isDebugEnabled(): boolean {
    return this.debugEnabled;
  }

  public setDebugEnabled(enabled: boolean) {
    this.debugEnabled = enabled;
  }
}

export const websocketDebugService = new WebSocketDebugServiceImpl();


