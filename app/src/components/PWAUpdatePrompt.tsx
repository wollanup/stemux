import { Button, Snackbar, Alert } from '@mui/material';
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

  return (
    <>
      {showReload && (
        <Snackbar
          open={showReload}
          onClose={close}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        >
          <Alert
            onClose={close}
            severity="info"
            sx={{ width: '100%' }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={() => updateServiceWorker(true)}
              >
                {t('pwa.reload')}
              </Button>
            }
          >
            {t('pwa.updateAvailable')}
          </Alert>
        </Snackbar>
      )}
    </>
  );
}
