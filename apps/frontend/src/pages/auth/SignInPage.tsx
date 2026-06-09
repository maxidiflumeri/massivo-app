import { SignIn } from '@clerk/clerk-react';
import { AuthLayout } from './AuthLayout';
import { brand } from '../../brand';

export function SignInPage() {
  return (
    <AuthLayout
      title="Bienvenido de vuelta"
      subtitle={`Iniciá sesión para entrar a tu panel de ${brand.name}.`}
    >
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
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
