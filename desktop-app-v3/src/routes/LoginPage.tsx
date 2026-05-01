import { FormEvent, useState } from 'react';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { useAuthStore, AuthError } from '../lib/auth';

export function LoginPage() {
  const login = useAuthStore((s) => s.login);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      if (err instanceof AuthError && err.code === 'EMAIL_NOT_VERIFIED') {
        setError('Please verify your email before signing in. Check your inbox for the verification link.');
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Flow<span className="text-primary-500">Shield</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Sign in to track your focus across every device.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-500/10 dark:border-red-500/20 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <Input
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            placeholder="you@example.com"
          />

          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />

          <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
            Sign in
          </Button>

          <p className="text-center text-xs text-gray-500 dark:text-gray-400">
            Don&apos;t have an account?{' '}
            <a
              href="https://flowshield.app/auth/signup"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-500 hover:text-primary-400"
            >
              Sign up at flowshield.app
            </a>
          </p>
        </form>
      </div>
    </div>
  );
}
