import { SignUp } from '@clerk/clerk-react';
import { AuthLayout } from './AuthLayout';

export function SignUpPage() {
  return (
    <AuthLayout
      title="Empezá gratis"
      subtitle="Creá tu cuenta y conectá tu WhatsApp en minutos."
    >
      <SignUp
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
        fallbackRedirectUrl="/dashboard"
        forceRedirectUrl="/dashboard"
        appearance={{
          elements: {
            rootBox: 'mx-auto',
            card: 'bg-transparent shadow-none border-0',
            headerTitle: 'hidden',
            headerSubtitle: 'hidden',
            footer: 'bg-transparent',
          },
        }}
      />
    </AuthLayout>
  );
}
