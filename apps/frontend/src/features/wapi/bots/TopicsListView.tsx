import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import StarIcon from '@mui/icons-material/Star';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import RouteIcon from '@mui/icons-material/Route';
import type { BotTopic } from './types';
import type { ValidationError } from './validateClient';

interface Props {
  topics: BotTopic[];
  errors: ValidationError[];
  /** ID del topic referenciado como `defaultTopicId` del router — se marca con ⭐. */
  defaultTopicId?: string;
  onCreate: () => void;
  onEditFlow: (id: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onOpenRouter: () => void;
  routerHasErrors: boolean;
  routerRulesCount: number;
}

/**
 * Vista lista de topics — punto de entrada al editor. Tabla con search por
 * nombre/id, acciones por fila (editar flow, renombrar, eliminar) y atajo a
 * Router. Reemplaza los tabs scrollables que no escalan a 40-50 topics.
 */
export function TopicsListView({
  topics,
  errors,
  defaultTopicId,
  onCreate,
  onEditFlow,
  onRename,
  onDelete,
  onOpenRouter,
  routerHasErrors,
  routerRulesCount,
}: Props) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(
      (t) => t.id.toLowerCase().includes(q) || t.label.toLowerCase().includes(q),
    );
  }, [topics, search]);

  const errorsByTopic = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of errors) {
      const match = e.path.match(/^topics\[([^\]]+)\]/);
      if (match) m.set(match[1], (m.get(match[1]) ?? 0) + 1);
    }
    return m;
  }, [errors]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, height: '100%' }}>
      <Stack direction="row" alignItems="center" gap={1} flexWrap="wrap">
        <TextField
          size="small"
          placeholder="Buscar por nombre o ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <Typography variant="caption" color="text.secondary">
          {filtered.length} de {topics.length} tema(s)
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<RouteIcon />}
          onClick={onOpenRouter}
          color={routerHasErrors ? 'warning' : 'primary'}
        >
          Router ({routerRulesCount})
          {routerHasErrors && <WarningAmberIcon fontSize="small" sx={{ ml: 0.5 }} />}
        </Button>
        <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={onCreate}>
          Nuevo tema
        </Button>
      </Stack>

      <Paper variant="outlined" sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Nombre</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Nodos
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Estado</TableCell>
                <TableCell sx={{ fontWeight: 600 }} align="right">
                  Acciones
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 6 }}>
                    {topics.length === 0 ? (
                      <Stack alignItems="center" gap={1}>
                        <Typography variant="body2" color="text.secondary">
                          Aún no hay temas. Creá el primero para empezar a armar el bot.
                        </Typography>
                        <Button
                          variant="contained"
                          size="small"
                          startIcon={<AddIcon />}
                          onClick={onCreate}
                        >
                          Crear tema
                        </Button>
                      </Stack>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Ningún tema coincide con "{search}".
                      </Typography>
                    )}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((t) => {
                  const errCount = errorsByTopic.get(t.id) ?? 0;
                  const nodesCount = Object.keys(t.flow.nodes).length;
                  const isDefault = t.id === defaultTopicId;
                  return (
                    <TableRow key={t.id} hover>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          {isDefault && (
                            <Tooltip title="Tema por defecto del router">
                              <StarIcon fontSize="small" color="primary" />
                            </Tooltip>
                          )}
                          <Typography variant="body2" fontWeight={500}>
                            {t.label}
                          </Typography>
                        </Stack>
                      </TableCell>
                      <TableCell>
                        <Typography
                          variant="caption"
                          sx={{ fontFamily: 'monospace', color: 'text.secondary' }}
                        >
                          {t.id}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={nodesCount} variant="outlined" />
                      </TableCell>
                      <TableCell>
                        {errCount === 0 ? (
                          <Stack direction="row" alignItems="center" gap={0.5}>
                            <CheckCircleOutlineIcon fontSize="small" color="success" />
                            <Typography variant="caption" color="success.main">
                              Válido
                            </Typography>
                          </Stack>
                        ) : (
                          <Stack direction="row" alignItems="center" gap={0.5}>
                            <WarningAmberIcon fontSize="small" color="warning" />
                            <Typography variant="caption" color="warning.main">
                              {errCount} error(es)
                            </Typography>
                          </Stack>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Editar flow">
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<OpenInNewIcon fontSize="small" />}
                            onClick={() => onEditFlow(t.id)}
                            sx={{ mr: 1 }}
                          >
                            Editar flow
                          </Button>
                        </Tooltip>
                        <Tooltip title="Renombrar">
                          <IconButton size="small" onClick={() => onRename(t.id)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip
                          title={
                            topics.length <= 1
                              ? 'Debe quedar al menos 1 tema'
                              : 'Eliminar tema'
                          }
                        >
                          <span>
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => onDelete(t.id)}
                              disabled={topics.length <= 1}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
