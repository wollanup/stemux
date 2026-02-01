import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  IconButton,
  Typography,
  Box,
  Divider,
  Stack,
  Paper,
  useMediaQuery,
  useTheme,
  CircularProgress,
} from '@mui/material';
import {
  Delete,
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { useAudioStore } from '../hooks/useAudioStore';
import type { PieceWithStats } from '../types/audio';

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
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  
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

  const loadData = async () => {
    setLoading(true);
    try {
      const [allPieces, current, total] = await Promise.all([
        listPieces(),
        getCurrentPiece(),
        getTotalStorageSize(),
      ]);
      
      // Filter out current piece from the list using the actual current piece ID
      const currentId = current?.id;
      const otherPieces = allPieces.filter(p => p.id !== currentId);
      setPieces(otherPieces);
      setCurrentPiece(current);
      setTotalSize(total);
    } catch (error) {
      console.error('Failed to load pieces:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadData();
    }
    // loadData is stable and doesn't need to be in deps
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
      <Dialog
        open={open}
        onClose={onClose}
        fullScreen={isMobile}
        maxWidth="sm"
        fullWidth
        aria-labelledby="pieces-manager-title"
      >
        <DialogTitle id="pieces-manager-title">{t('pieces.title')}</DialogTitle>
        <DialogContent>
          {loading ? (
            <Box display="flex" justifyContent="center" p={4}>
              <CircularProgress />
            </Box>
          ) : (
            <Stack spacing={3}>
              {/* Current piece section */}
              {currentPiece && (
                <Paper variant="outlined" sx={{ p: 2 }}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                    <Typography variant="overline" color="text.secondary">
                      {t('pieces.currentPiece')}
                    </Typography>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => setDeleteConfirm(currentPiece.id)}
                      aria-label={t('pieces.delete')}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Stack>
                  
                  {isEditingName ? (
                    <TextField
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onBlur={handleRename}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleRename();
                        } else if (e.key === 'Escape') {
                          handleCancelEdit();
                        }
                      }}
                      autoFocus
                      size="small"
                      variant="standard"
                      fullWidth
                      sx={{ mb: 1 }}
                    />
                  ) : (
                    <Typography
                      variant="h6"
                      gutterBottom
                      onClick={handleStartEditName}
                      sx={{
                        cursor: 'pointer',
                        '&:hover': {
                          color: 'primary.main',
                        },
                      }}
                    >
                      {currentPiece.name}
                    </Typography>
                  )}
                  
                  <Typography variant="body2" color="text.secondary">
                    {t('pieces.tracks', { count: currentPiece.trackCount })} • {formatBytes(currentPiece.size, t)}
                  </Typography>
                </Paper>
              )}

              {/* New piece button */}
              <Box>
                <Button
                  variant="contained"
                  fullWidth
                  onClick={handleCreatePiece}
                  color="primary"
                >
                  {t('pieces.newPiece')}
                </Button>
              </Box>

              <Divider />

              {/* Other pieces list */}
              <Box>
                {pieces.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>
                    {t('pieces.noPieces')}
                  </Typography>
                ) : (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      {t('pieces.title')}
                    </Typography>
                    <List disablePadding>
                      {pieces.map((piece) => (
                        <ListItem
                          key={piece.id}
                          disablePadding
                          secondaryAction={
                            <IconButton
                              edge="end"
                              aria-label={t('pieces.delete')}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteConfirm(piece.id);
                              }}
                            >
                              <Delete />
                            </IconButton>
                          }
                        >
                          <ListItemButton onClick={() => handleLoadPiece(piece.id)}>
                            <ListItemText
                              primary={piece.name}
                              secondary={
                                `${t('pieces.tracks', { count: piece.trackCount })} • ${formatBytes(piece.size, t)}`
                              }
                            />
                          </ListItemButton>
                        </ListItem>
                      ))}
                    </List>
                  </>
                )}
              </Box>

              <Divider />

              {/* Global stats */}
              <Box>
                <Typography variant="subtitle2" gutterBottom>
                  {t('pieces.globalStats')}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('pieces.totalSize')}: {formatBytes(totalSize, t)}
                </Typography>
                <Button
                  variant="outlined"
                  color="error"
                  onClick={() => setDeleteAllConfirm(true)}
                  disabled={totalSize === 0}
                  fullWidth
                >
                  {t('pieces.deleteAll')}
                </Button>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose}>{t('pieces.closeButton')}</Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteConfirm !== null}
        onClose={() => setDeleteConfirm(null)}
        aria-labelledby="delete-piece-title"
      >
        <DialogTitle id="delete-piece-title">{t('pieces.deleteConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography>
            {t('pieces.deleteConfirmMessage', {
              name: pieceToDelete?.name || '',
              count: pieceToDelete?.trackCount || 0,
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirm(null)}>{t('pieces.cancelButton')}</Button>
          <Button
            onClick={() => deleteConfirm && handleDeletePiece(deleteConfirm)}
            color="error"
            variant="contained"
          >
            {t('pieces.deleteConfirmButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete all confirmation dialog */}
      <Dialog
        open={deleteAllConfirm}
        onClose={() => setDeleteAllConfirm(false)}
        aria-labelledby="delete-all-pieces-title"
      >
        <DialogTitle id="delete-all-pieces-title">{t('pieces.deleteAllConfirmTitle')}</DialogTitle>
        <DialogContent>
          <Typography>{t('pieces.deleteAllConfirmMessage')}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteAllConfirm(false)}>{t('pieces.cancelButton')}</Button>
          <Button onClick={handleDeleteAll} color="error" variant="contained">
            {t('pieces.deleteAllConfirmButton')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default PiecesManager;
