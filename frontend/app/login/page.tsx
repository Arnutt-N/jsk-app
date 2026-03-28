'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { Shield, Lock, User } from 'lucide-react';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === 'localhost' || host === '127.0.0.1');
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/admin');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      toast({
        title: 'Error',
        description: 'Please enter both username and password',
        variant: 'error'
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username, password);
      toast({
        title: 'Success',
        description: 'Successfully logged in. Redirecting...',
        variant: 'success'
      });
      router.replace('/admin');
    } catch {
      toast({
        title: 'Login Failed',
        description: 'Invalid username or password. Please try again.',
        variant: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-info/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4 pointer-events-none" />

      <Card className="w-full max-w-md shadow-2xl shadow-brand-500/5 border-border-default relative z-10 animate-fade-in-up">
        <CardHeader className="space-y-1 flex flex-col items-center">
          <div className="w-14 h-14 rounded-2xl gradient-logo flex items-center justify-center text-white font-bold text-lg shadow-lg shadow-brand-500/20 mb-4">
            JS
          </div>
          <CardTitle className="text-2xl font-bold text-center tracking-tight">JSK Admin</CardTitle>
          <CardDescription className="text-center">
            เข้าสู่ระบบเพื่อจัดการ LINE Official Account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="relative">
                <Input
                  id="username"
                  type="text"
                  placeholder="admin"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="username"
                />
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                  autoComplete="current-password"
                />
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" size={18} />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full mt-2"
              isLoading={isSubmitting}
              glow
              shine
            >
              Sign In
            </Button>
          </form>

          {isLocalhost && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <Button
                type="button"
                variant="outline"
                className="w-full text-sm border-warning/30 text-warning hover:bg-warning/10"
                onClick={() => {
                  localStorage.setItem('dev_bypass', 'true');
                  toast({
                    title: 'Dev Mode',
                    description: 'ข้ามเข้าสู่ระบบสำเร็จ (localhost only)',
                    variant: 'success'
                  });
                  window.location.href = '/admin';
                }}
              >
                ⚡ Dev Quick Login (ข้ามเข้าสู่ระบบ)
              </Button>
              <p className="text-xs text-text-tertiary text-center mt-2">
                แสดงเฉพาะบน localhost เท่านั้น
              </p>
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-col space-y-4 border-t border-border-subtle pt-6">
          <div className="flex items-center justify-center gap-2 text-xs text-text-tertiary">
            <Shield className="w-3.5 h-3.5" />
            <span>Enterprise-grade security &middot; JWT + RBAC</span>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthProvider>
      <LoginForm />
    </AuthProvider>
  );
}
