import { useState, useEffect } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconFolderOpen, IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import type { PieceWithStats } from '../types/audio';
import { useMedia } from '../theme/palette';
import { MOBILE_QUERY } from '../theme/theme';
import ConfirmDialog from './ConfirmDialog';
import classes from './PiecesManager.module.css';

interface PiecesManagerProps {
  open: boolean;
  onClose: () => void;
}

const formatBytes = (bytes: number, t: (key: string) => string): string => {
  if (bytes === 0) return `0 ${t('units.bytes')}`;
  const k = 1024;
  const sizes = [
    t('units.bytes'),
    t('units.kb'),
    t('units.mb'),
    t('units.gb'),
  ];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const PiecesManager = ({ open, onClose }: PiecesManagerProps) => {
  const { t } = useTranslation();
  const isMobile = useMedia(MOBILE_QUERY);
  
  const {
    currentPieceId,
    listPieces,
    getCurrentPiece,
    createPiece,
    loadPiece,
    deletePiece,
    renamePiece,
    deleteAllPieces,
    getTotalStorageSize,
  } = useAudioStore();

  const [pieces, setPieces] = useState<PieceWithStats[]>([]);
  const [currentPiece, setCurrentPiece] = useState<PieceWithStats | null>(null);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');

  const generatePieceName = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}-${minutes}`;
  };

  // Show the spinner as soon as the modal opens or the current piece changes
  // (adjusted during render, so the effect below only has async state updates)
  const loadKey = open ? currentPieceId : null;
  const [lastLoadKey, setLastLoadKey] = useState(loadKey);
  if (loadKey !== lastLoadKey) {
    setLastLoadKey(loadKey);
    if (open) setLoading(true);
  }

  const fetchData = () =>
    Promise.all([listPieces(), getCurrentPiece(), getTotalStorageSize()]);

  const applyData = ([allPieces, current, total]: Awaited<ReturnType<typeof fetchData>>) => {
    // Filter out current piece from the list using the actual current piece ID
    const currentId = current?.id;
    setPieces(allPieces.filter(p => p.id !== currentId));
    setCurrentPiece(current);
    setTotalSize(total);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      applyData(await fetchData());
    } catch (error) {
      console.error('Failed to load pieces:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    // Ignore results that arrive after the modal closed or the piece changed
    let cancelled = false;
    fetchData()
      .then((data) => {
        if (!cancelled) applyData(data);
      })
      .catch((error) => console.error('Failed to load pieces:', error))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // fetchData/applyData are stable and don't need to be in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentPieceId]);

  const handleCreatePiece = async () => {
    try {
      const newPieceName = generatePieceName();
      const pieceId = await createPiece(newPieceName);
      // Load the new empty piece
      await loadPiece(pieceId);
      // Close the modal
      onClose();
    } catch (error) {
      console.error('Failed to create piece:', error);
    }
  };

  const handleLoadPiece = async (id: string) => {
    try {
      await loadPiece(id);
      onClose();
    } catch (error) {
      console.error('Failed to load piece:', error);
    }
  };

  const handleDeletePiece = async (id: string) => {
    try {
      await deletePiece(id);
      setDeleteConfirm(null);
      await loadData();
    } catch (error) {
      console.error('Failed to delete piece:', error);
    }
  };

  const handleDeleteAll = async () => {
    try {
      await deleteAllPieces();
      setDeleteAllConfirm(false);
      onClose();
    } catch (error) {
      console.error('Failed to delete all pieces:', error);
    }
  };

  const handleRename = async () => {
    if (!currentPiece || !editedName.trim()) return;
    
    try {
      await renamePiece(currentPiece.id, editedName.trim());
      setIsEditingName(false);
      await loadData();
    } catch (error) {
      console.error('Failed to rename piece:', error);
    }
  };

  const handleStartEditName = () => {
    if (currentPiece) {
      setEditedName(currentPiece.name);
      setIsEditingName(true);
    }
  };

  const handleCancelEdit = () => {
    if (currentPiece) {
      setEditedName(currentPiece.name);
    }
    setIsEditingName(false);
  };

  const pieceToDelete = deleteConfirm ? pieces.find(p => p.id === deleteConfirm) || currentPiece : null;

  return (
    <>
      <Modal
        opened={open}
        onClose={onClose}
        fullScreen={isMobile}
        size={600}
        title={t('pieces.title')}
      >
        {loading ? (
          <Group justify="center" p="xl">
            <Loader />
          </Group>
        ) : (
          <Stack gap="lg">
            {/* Current piece section */}
            {currentPiece && (
              <Paper withBorder p="md">
                <Group justify="space-between" mb="xs">
                  <Text size="xs" c="dimmed" tt="uppercase" fw={500} lts={1}>
                    {t('pieces.currentPiece')}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    color="red"
                    onClick={() => setDeleteConfirm(currentPiece.id)}
                    aria-label={t('pieces.delete')}
                  >
                    <IconTrash size={18} />
                  </ActionIcon>
                </Group>

                {isEditingName ? (
                  <TextInput
                    value={editedName}
                    onChange={(e) => setEditedName(e.currentTarget.value)}
                    onBlur={handleRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRename();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        handleCancelEdit();
                      }
                    }}
                    autoFocus
                    variant="unstyled"
                    size="lg"
                    mb="xs"
                  />
                ) : (
                  <Text size="lg" fw={500} mb="xs" onClick={handleStartEditName} className={classes.name}>
                    {currentPiece.name}
                  </Text>
                )}

                <Text size="sm" c="dimmed">
                  {t('pieces.tracks', { count: currentPiece.trackCount })} • {formatBytes(currentPiece.size, t)}
                </Text>
              </Paper>
            )}

            {/* New piece button */}
            <Button fullWidth onClick={handleCreatePiece}>
              {t('pieces.newPiece')}
            </Button>

            <Divider />

            {/* Other pieces list */}
            <Box>
              {pieces.length === 0 ? (
                <Text size="sm" c="dimmed" py="md" ta="center">
                  {t('pieces.noPieces')}
                </Text>
              ) : (
                <>
                  <Text size="sm" fw={600} mb="xs">
                    {t('pieces.title')}
                  </Text>
                  <Stack gap={0}>
                    {pieces.map((piece) => (
                      <Group key={piece.id} data-piece={piece.name} className={classes.piece} wrap="nowrap" gap="xs">
                        <Box flex={1} miw={0}>
                          <Text truncate>{piece.name}</Text>
                          <Text size="sm" c="dimmed">
                            {`${t('pieces.tracks', { count: piece.trackCount })} • ${formatBytes(piece.size, t)}`}
                          </Text>
                        </Box>
                        {/* Opening a piece is explicit: a tap on the row does nothing */}
                        <Button
                          size="xs"
                          variant="outline"
                          leftSection={<IconFolderOpen size={16} />}
                          onClick={() => handleLoadPiece(piece.id)}
                        >
                          {t('pieces.open')}
                        </Button>
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size="lg"
                          aria-label={t('pieces.delete')}
                          onClick={() => setDeleteConfirm(piece.id)}
                        >
                          <IconTrash size={20} />
                        </ActionIcon>
                      </Group>
                    ))}
                  </Stack>
                </>
              )}
            </Box>

            <Divider />

            {/* Global stats */}
            <Box>
              <Text size="sm" fw={600} mb="xs">
                {t('pieces.globalStats')}
              </Text>
              <Text size="sm" c="dimmed" mb="xs">
                {t('pieces.totalSize')}: {formatBytes(totalSize, t)}
              </Text>
              <Button
                variant="outline"
                color="red"
                onClick={() => setDeleteAllConfirm(true)}
                disabled={totalSize === 0}
                fullWidth
              >
                {t('pieces.deleteAll')}
              </Button>
            </Box>
          </Stack>
        )}
        <Group justify="flex-end" mt="lg">
          <Button variant="subtle" onClick={onClose}>
            {t('pieces.closeButton')}
          </Button>
        </Group>
      </Modal>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        opened={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => deleteConfirm && handleDeletePiece(deleteConfirm)}
        title={t('pieces.deleteConfirmTitle')}
        message={t('pieces.deleteConfirmMessage', {
          name: pieceToDelete?.name || '',
          count: pieceToDelete?.trackCount || 0,
        })}
        cancelLabel={t('pieces.cancelButton')}
        confirmLabel={t('pieces.deleteConfirmButton')}
      />

      {/* Delete all confirmation dialog */}
      <ConfirmDialog
        opened={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        onConfirm={handleDeleteAll}
        title={t('pieces.deleteAllConfirmTitle')}
        message={t('pieces.deleteAllConfirmMessage')}
        cancelLabel={t('pieces.cancelButton')}
        confirmLabel={t('pieces.deleteAllConfirmButton')}
      />
    </>
  );
};

export default PiecesManager;
