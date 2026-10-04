/**
 * Confirmation of a destructive action: a message, Cancel and a red button.
 */

import type { ReactNode } from 'react';
import { Button, Group, Modal, Text } from '@mantine/core';

interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message: ReactNode;
  cancelLabel: ReactNode;
  confirmLabel: ReactNode;
}

export default function ConfirmDialog({ opened, onClose, onConfirm, title, message, cancelLabel, confirmLabel }: ConfirmDialogProps) {
  return (
    <Modal opened={opened} onClose={onClose} title={title} centered>
      <Text c="dimmed">{message}</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="subtle" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button color="red" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
