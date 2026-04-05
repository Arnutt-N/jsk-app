'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'motion/react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import { Checkbox } from '@/components/ui/Checkbox';
import { Alert } from '@/components/ui/Alert';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  Lock,
  User,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  AlertCircle
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);
  
  // Validation States
  const [errors, setErrors] = useState<{username?: string; password?: string}>({});
  const [loginError, setLoginError] = useState<string | null>(null);

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

  const validateForm = () => {
    const newErrors: {username?: string; password?: string} = {};
    let isValid = true;

    if (!username.trim()) {
      newErrors.username = 'กรุณากรอกชื่อผู้ใช้';
      isValid = false;
    }
    
    if (!password) {
      newErrors.password = 'กรุณากรอกรหัสผ่าน';
      isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    
    if (!validateForm()) {
      toast({
        title: 'ตรวจสอบข้อมูล',
        description: 'กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง',
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
      setLoginError('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
      toast({
        title: 'เข้าสู่ระบบไม่สำเร็จ',
        description: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FAFAFA] dark:bg-slate-950 transition-colors duration-500 font-sans">
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

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Outer glassmorphic border matching Landing Mockup */}
        <div className="rounded-[2.5rem] border border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-3 relative group">
          <Card className="rounded-[2rem] border-slate-100/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 overflow-hidden shadow-2xl relative z-10 p-2 sm:p-4">
            <CardHeader className="space-y-6 flex flex-col items-center pb-6 pt-8">
              {/* Brand Logo - Navy Blue Gradient Icon Only */}
              <Link
                href="/"
                className="transition-transform hover:scale-105 duration-300 cursor-pointer"
              >
                <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-blue-800/30 bg-gradient-to-br from-blue-900 to-blue-700 text-sm font-bold tracking-[0.24em] text-white shadow-lg shadow-blue-900/20">
                  <span className="ml-[0.24em]">JSK</span>
                  <span className="absolute inset-x-3 bottom-2 h-[2px] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-70" />
                </div>
              </Link>

              <div className="space-y-2 text-center">
                <CardTitle className="font-heading text-3xl font-black tracking-tight">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-950 to-blue-500 dark:from-blue-300 dark:to-blue-500">
                    JSK 4.0 Platform
                  </span>
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 font-medium">
                  เข้าสู่ระบบจัดการงานสำหรับเจ้าหน้าที่
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="space-y-5 pb-8">
              
              {/* Login Error Alert */}
              <AnimatePresence mode="wait">
                {loginError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-4"
                  >
                    <Alert variant="danger" className="rounded-xl">
                      <span className="text-sm font-semibold">{loginError}</span>
                    </Alert>
                  </motion.div>
                )}
              </AnimatePresence>

              <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                {/* Username Field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className={cn(
                      "text-sm font-bold ml-1 transition-colors",
                      errors.username ? "text-danger" : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    ชื่อผู้ใช้ <span className="text-danger">*</span>
                  </Label>
                  <div className="relative group">
                    <Input
                      id="username"
                      type="text"
                      placeholder="กรอกชื่อผู้ใช้ของคุณ"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (errors.username) setErrors({ ...errors, username: undefined });
                      }}
                      className={cn(
                        "pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-slate-200 dark:border-white/10 transition-all",
                        errors.username 
                          ? "border-danger focus:ring-danger focus:border-danger bg-danger/5" 
                          : "focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300"
                      )}
                      required
                      autoComplete="username"
                    />
                    <User className={cn(
                      "absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors",
                      errors.username ? "text-danger" : "text-slate-400 group-focus-within:text-blue-600"
                    )} />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className={cn(
                      "text-sm font-bold ml-1 transition-colors",
                      errors.password ? "text-danger" : "text-slate-700 dark:text-slate-300"
                    )}
                  >
                    รหัสผ่าน <span className="text-danger">*</span>
                  </Label>
                  <div className="relative group">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (errors.password) setErrors({ ...errors, password: undefined });
                      }}
                      className={cn(
                        "pl-11 pr-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-slate-200 dark:border-white/10 transition-all",
                        errors.password 
                          ? "border-danger focus:ring-danger focus:border-danger bg-danger/5" 
                          : "focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300"
                      )}
                      required
                      autoComplete="current-password"
                    />
                    <Lock className={cn(
                      "absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors",
                      errors.password ? "text-danger" : "text-slate-400 group-focus-within:text-blue-600"
                    )} />

                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4.5 h-4.5" />
                      ) : (
                        <Eye className="w-4.5 h-4.5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Remember Me & Forgot Password - Unified Row */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) =>
                        setRememberMe(checked === true)
                      }
                      className="w-4.5 h-4.5 rounded-md border-slate-300 dark:border-white/20 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 cursor-pointer"
                    />
                    <label
                      htmlFor="remember-me"
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 cursor-pointer select-none"
                    >
                      จดจำฉัน
                    </label>
                  </div>
                  
                  <Link
                    href="#"
                    className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    ลืมรหัสผ่าน?
                  </Link>
                </div>

                {/* Submit Button - Matches Landing Hero CTA */}
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full h-14 mt-4 rounded-full bg-blue-900 hover:bg-blue-800 text-white font-black text-base shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden cursor-pointer"
                  isLoading={isSubmitting}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isSubmitting ? 'กำลังตรวจสอบ...' : 'เข้าสู่ระบบ'}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </Button>
              </form>

              {/* Or Register Section */}
              <div className="mt-6">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-200 dark:border-white/10" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 font-medium">หรือ</span>
                  </div>
                </div>
                <div className="mt-4 text-center text-sm font-medium text-slate-600 dark:text-slate-400">
                  ยังไม่มีบัญชี?{" "}
                  <Link href="/register" className="text-blue-600 dark:text-blue-400 hover:underline font-bold">
                    ลงทะเบียนเจ้าหน้าที่
                  </Link>
                </div>
              </div>

              {/* Dev Quick Login */}
              {process.env.NODE_ENV === 'development' && isLocalhost && (
                <div className="pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full h-11 text-xs font-bold border-amber-200/50 dark:border-amber-500/20 text-amber-600 dark:text-amber-400 bg-amber-50/30 dark:bg-amber-500/5 hover:bg-amber-50 dark:hover:bg-amber-500/10 rounded-2xl transition-all cursor-pointer whitespace-nowrap overflow-hidden flex items-center justify-center"
                    onClick={() => {
                      localStorage.setItem('dev_bypass', 'true');
                      window.location.href = '/admin';
                    }}
                  >
                    <KeyRound className="w-4 h-4 mr-2 shrink-0" />
                    <span className="truncate">Local Dev Quick Bypass</span>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Home link & Copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex flex-col items-center gap-4"
        >
          <Link
            href="/"
            className="text-sm font-bold text-slate-500 hover:text-blue-900 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center gap-2 cursor-pointer group"
          >
            <ArrowRight className="w-4 h-4 rotate-180 group-hover:-translate-x-1 transition-transform" />
            กลับสู่หน้าหลัก
          </Link>

          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium text-center">
            Copyright 2026 สำนักงานยุติธรรมจังหวัดสกลนคร สำนักงานปลัดกระทรวงยุติธรรม
          </div>
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
