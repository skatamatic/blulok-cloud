import { useEffect } from 'react';

type AppStartupSplashProps = {
  visible: boolean;
};

export function AppStartupSplash({ visible }: AppStartupSplashProps) {
  useEffect(() => {
    document.getElementById('boot-splash')?.remove();
  }, []);

  return (
    <div
      className={`app-startup-splash${visible ? '' : ' app-startup-splash--hidden'}`}
      role="status"
      aria-busy={visible}
      aria-live="polite"
      aria-label="Starting BluLok Gateway Simulator"
    >
      <div className="app-startup-splash-inner">
        <div className="app-startup-splash-spinner" aria-hidden />
        <p className="app-startup-splash-title">BluLok Gateway Simulator</p>
        <p className="app-startup-splash-subtitle">Starting simulator…</p>
      </div>
    </div>
  );
}
