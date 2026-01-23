import { useEffect, useState } from 'react';
import { Button, Snackbar, Alert } from '@mui/material';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTranslation } from 'react-i18next';

export function PWAUpdatePrompt() {
  const { t } = useTranslation();
  const [showReload, setShowReload] = useState(false);
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r: ServiceWorkerRegistration | undefined) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error: Error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      setShowReload(true);
    }
  }, [needRefresh]);

  const close = () => {
    setNeedRefresh(false);
    setShowReload(false);
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
