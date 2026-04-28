import { SignIn } from '@clerk/clerk-react';
import { Box } from '@mui/material';

export function SignInPage() {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', width: '100vw' }}>
      <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
    </Box>
  );
}
