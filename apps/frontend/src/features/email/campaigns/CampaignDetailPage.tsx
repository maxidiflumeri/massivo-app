import { Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

export function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <Typography variant="h4">Campaña {id} (placeholder — 3.C.3.c/d)</Typography>;
}
