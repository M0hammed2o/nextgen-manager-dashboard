import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Eye, EyeOff } from 'lucide-react';
import logoNextgen from '@/assets/logo-nextgen.jpeg';

export default function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login({ email, password });
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-sidebar flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <div className="relative z-10 text-center">
          <img src={logoNextgen} alt="NextGen Intelligence" className="w-32 h-32 rounded-2xl object-cover mx-auto mb-8 shadow-2xl" />
          <h1 className="text-3xl font-bold text-sidebar-primary-foreground mb-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
            NextGen Intelligence
          </h1>
          <p className="text-sidebar-foreground text-lg max-w-sm">
            AI-Powered Restaurant Management Platform
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6 max-w-xs mx-auto text-sidebar-foreground">
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">AI</p>
              <p className="text-xs mt-1">Powered</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">24/7</p>
              <p className="text-xs mt-1">Ordering</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-primary">Live</p>
              <p className="text-xs mt-1">Analytics</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-sm space-y-8">
          <div className="lg:hidden flex justify-center mb-6">
            <img src={logoNextgen} alt="NextGen Intelligence" className="w-16 h-16 rounded-xl object-cover" />
          </div>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">Manager Login</h2>
            <p className="text-sm text-muted-foreground mt-1">Sign in to your business dashboard</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sign In'}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground">
            Staff member?{' '}
            <a href="/staff-login" className="text-primary hover:underline">
              Login with PIN
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
