'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Checkbox } from '@/components/ui/Checkbox';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  Shield,
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  UserPlus,
} from 'lucide-react';
import Link from 'next/link';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  // Load remembered username on mount
  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === 'localhost' || host === '127.0.0.1');

    const remembered = localStorage.getItem('jsk-remember-user');
    if (remembered) {
      setUsername(remembered);
      setRememberMe(true);
    }
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
        description: 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน',
        variant: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await login(username, password);

      // Handle remember me
      if (rememberMe) {
        localStorage.setItem('jsk-remember-user', username);
      } else {
        localStorage.removeItem('jsk-remember-user');
      }

      toast({
        title: 'สำเร็จ',
        description: 'เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...',
        variant: 'success',
      });
      router.replace('/admin');
    } catch {
      toast({
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        description: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FAFAFA] dark:bg-slate-950 transition-colors duration-500">
      {/* Shared Background with Landing Page */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />

        {/* Animated Orbs */}
        <motion.div
          animate={{
            y: [0, 50, 0],
            x: [0, 30, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute top-[-10%] left-[-5%] w-[800px] h-[800px] bg-blue-900/10 dark:bg-blue-400/10 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{
            y: [0, -40, 0],
            x: [0, -20, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{
            duration: 25,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute bottom-[-10%] right-[-5%] w-[700px] h-[700px] bg-blue-400/10 dark:bg-blue-900/15 blur-[120px] rounded-full"
        />
      </div>

      {/* Decorative blurs near the card */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg h-full max-h-[700px] pointer-events-none opacity-50 dark:opacity-30">
        <div className="absolute -top-10 -left-10 w-40 h-40 bg-blue-400/30 rounded-full blur-3xl" />
        <div className="absolute -bottom-10 -right-10 w-48 h-48 bg-blue-900/30 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Outer glassmorphic border matching Landing Mockup */}
        <div className="rounded-[2.5rem] border border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-3 relative group">
          <Card className="rounded-[2rem] border-slate-100/80 dark:border-white/10 bg-white/90 dark:bg-slate-900/90 overflow-hidden shadow-2xl relative z-10 p-2 sm:p-4">
            <CardHeader className="space-y-4 flex flex-col items-center pb-6 pt-6">
              {/* JSK Platform Logo */}
              <Link
                href="/"
                className="group/logo flex items-center justify-center transition-transform hover:scale-110 duration-300 cursor-pointer"
              >
                <div className="w-16 h-16 bg-gradient-to-br from-blue-900 to-blue-500 rounded-full flex items-center justify-center shadow-lg shadow-blue-900/20 group-hover/logo:shadow-blue-500/40 transition-shadow">
                  <span className="text-white text-lg font-bold tracking-tight">
                    JSK
                  </span>
                </div>
              </Link>

              <div className="space-y-1.5 text-center">
                <CardTitle className="font-heading text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                  เข้าสู่ระบบ
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 font-medium">
                  จัดการระบบ JSK Platform สำหรับเจ้าหน้าที่
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5">
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Username Field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className="text-sm font-bold text-slate-700 dark:text-slate-300 ml-1"
                  >
                    ชื่อผู้ใช้
                  </Label>
                  <div className="relative group">
                    <Input
                      id="username"
                      type="text"
                      placeholder="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/10 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-all"
                      required
                      autoComplete="username"
                    />
                    <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors w-[18px] h-[18px]" />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between ml-1 mr-1">
                    <Label
                      htmlFor="password"
                      className="text-sm font-bold text-slate-700 dark:text-slate-300"
                    >
                      รหัสผ่าน
                    </Label>
                    <Link
                      href="#"
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      ลืมรหัสผ่าน?
                    </Link>
                  </div>
                  <div className="relative group">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-11 pr-12 h-12 bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-white/10 rounded-2xl focus:ring-blue-500 focus:border-blue-500 transition-all"
                      required
                      autoComplete="current-password"
                    />
                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors w-[18px] h-[18px]" />

                    {/* Show/Hide Password Toggle */}
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={
                        showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-all cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me */}
                <div className="flex items-center gap-3 ml-1">
                  <Checkbox
                    id="remember-me"
                    checked={rememberMe}
                    onCheckedChange={(checked) =>
                      setRememberMe(checked === true)
                    }
                    className="!border-slate-300 dark:!border-white/20 data-[state=checked]:!bg-blue-600 data-[state=checked]:!border-blue-600"
                  />
                  <label
                    htmlFor="remember-me"
                    className="text-sm font-medium text-slate-600 dark:text-slate-400 cursor-pointer select-none"
                  >
                    จำฉันไว้ในระบบ
                  </label>
                </div>

                {/* Submit Button */}
                <Button
                  type="submit"
                  className="w-full h-14 rounded-full bg-blue-900 hover:bg-blue-800 text-white font-bold text-base shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-[1.02] transition-all group overflow-hidden cursor-pointer"
                  isLoading={isSubmitting}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    เข้าสู่ระบบ
                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </Button>
              </form>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white/90 dark:bg-slate-900/90 text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
                    หรือ
                  </span>
                </div>
              </div>

              {/* Register CTA */}
              <div className="text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  ยังไม่มีบัญชี?{' '}
                  <Link
                    href="#"
                    className="font-bold text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors cursor-pointer"
                  >
                    ลงทะเบียนเจ้าหน้าที่
                  </Link>
                </p>
              </div>

              {/* Dev Quick Login */}
              {process.env.NODE_ENV === 'development' && isLocalhost && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="pt-4 border-t border-slate-100 dark:border-white/5"
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-12 text-sm font-bold border-amber-200/50 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-500/5 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-2xl transition-all cursor-pointer"
                    onClick={() => {
                      localStorage.setItem('dev_bypass', 'true');
                      toast({
                        title: 'Dev Mode',
                        description:
                          'ข้ามเข้าสู่ระบบสำเร็จ (localhost only)',
                        variant: 'success',
                      });
                      window.location.href = '/admin';
                    }}
                  >
                    <KeyRound className="w-4 h-4 mr-2" />
                    Dev Quick Login
                  </Button>
                  <p className="text-[10px] text-slate-400 text-center mt-2 uppercase tracking-widest font-bold">
                    Localhost Only
                  </p>
                </motion.div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col items-center gap-3 border-t border-slate-100 dark:border-white/5 pt-5 pb-5 bg-slate-50/50 dark:bg-slate-800/30">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400 dark:text-slate-500">
                <Shield className="w-3.5 h-3.5 text-blue-500" />
                <span className="uppercase tracking-tight">
                  Enterprise-grade security &middot; JWT + RBAC
                </span>
              </div>
            </CardFooter>
          </Card>
        </div>

        {/* Home link */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8 flex justify-center"
        >
          <Link
            href="/"
            className="text-sm font-bold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2 cursor-pointer"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            กลับหน้าหลัก
          </Link>
        </motion.div>
      </motion.div>
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
