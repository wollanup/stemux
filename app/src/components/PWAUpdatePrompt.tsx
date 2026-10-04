import { Button, Notification, Portal } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';
import {logger} from '../utils/logger';
export function PWAUpdatePrompt() {
  const { t } = useTranslation();

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      logger.debug('SW Registered: ' + r);
      // Check for updates every hour
      if (r) {
        setInterval(() => {
          r.update();
        }, 60 * 60 * 1000);
      }
    },
    onRegisterError(error: Error) {
      logger.debug('SW registration error', error);
    },
  });

  // Derive showReload from needRefresh (no setState in effect)
  const showReload = needRefresh;

  const close = () => {
    setNeedRefresh(false);
  };

  if (!showReload) return null;

  return (
    <Portal>
      <Notification
        onClose={close}
        withBorder
        style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 1400, maxWidth: 'calc(100vw - 32px)' }}
      >
        {t('pwa.updateAvailable')}
        <Button variant="light" size="compact-sm" ml="md" onClick={() => updateServiceWorker(true)}>
          {t('pwa.reload')}
        </Button>
      </Notification>
    </Portal>
  );
}
