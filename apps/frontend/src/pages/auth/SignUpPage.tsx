import { SignUp } from '@clerk/clerk-react';
import { Box } from '@mui/material';

export function SignUpPage() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>
      <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
    </Box>
  );
}
