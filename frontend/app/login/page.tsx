'use client';

import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

type LoginRequestError = Error & {
  status?: number;
  code?: string;
};

type LoginErrorInfo = {
  alertMessage: string;
  toastTitle: string;
  toastDescription: string;
};

function getLoginErrorInfo(error: unknown): LoginErrorInfo {
  const loginError = error as LoginRequestError | undefined;

  if (loginError?.status === 401 || loginError?.code === 'INVALID_CREDENTIALS') {
    return {
      alertMessage: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบแล้วลองใหม่อีกครั้ง',
      toastTitle: 'เข้าสู่ระบบไม่สำเร็จ',
      toastDescription: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง',
    };
  }

  if (loginError?.code === 'NETWORK_ERROR' || loginError?.status === 0) {
    return {
      alertMessage: 'ไม่สามารถเชื่อมต่อระบบเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
      toastTitle: 'เชื่อมต่อระบบไม่ได้',
      toastDescription: 'ระบบอาจกำลังเริ่มทำงานหรือเครือข่ายมีปัญหาชั่วคราว',
    };
  }

  if (typeof loginError?.status === 'number' && loginError.status >= 500) {
    return {
      alertMessage: 'ระบบเข้าสู่ระบบขัดข้องชั่วคราว กรุณาลองใหม่อีกครั้ง',
      toastTitle: 'ระบบขัดข้องชั่วคราว',
      toastDescription: 'เซิร์ฟเวอร์ไม่พร้อมให้บริการชั่วคราว กรุณาลองใหม่อีกครั้ง',
    };
  }

  return {
    alertMessage: 'ไม่สามารถเข้าสู่ระบบได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง',
    toastTitle: 'เข้าสู่ระบบไม่สำเร็จ',
    toastDescription: 'เกิดข้อผิดพลาดที่ไม่คาดคิดระหว่างเข้าสู่ระบบ',
  };
}

function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocalhost, setIsLocalhost] = useState(false);
  const [errors, setErrors] = useState<{ username?: string; password?: string }>({});
  const [loginError, setLoginError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement | null>(null);
  const usernameInputRef = useRef<HTMLInputElement | null>(null);
  const passwordInputRef = useRef<HTMLInputElement | null>(null);

  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    const host = window.location.hostname;
    setIsLocalhost(host === 'localhost' || host === '127.0.0.1');

    const remembered = localStorage.getItem('jsk-remember-user');
    if (remembered) {
      if (usernameInputRef.current) {
        usernameInputRef.current.value = remembered;
      }
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/admin');
    }
  }, [isAuthenticated, isLoading, router]);

  const readFormCredentials = () => {
    const formData = formRef.current ? new FormData(formRef.current) : null;
    const submittedUsername = (
      formData?.get('username')?.toString() ??
      usernameInputRef.current?.value ??
      ''
    ).trim();
    const submittedPassword = (
      formData?.get('password')?.toString() ??
      passwordInputRef.current?.value ??
      ''
    );

    if (usernameInputRef.current) {
      usernameInputRef.current.value = submittedUsername;
    }

    return {
      username: submittedUsername,
      password: submittedPassword,
    };
  };

  const clearFieldError = (field: 'username' | 'password') => {
    if (loginError) {
      setLoginError(null);
    }

    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      return {
        ...current,
        [field]: undefined,
      };
    });
  };

  const validateForm = (username: string, password: string) => {
    const nextErrors: { username?: string; password?: string } = {};

    if (!username) {
      nextErrors.username = 'กรุณากรอกชื่อผู้ใช้';
    }

    if (!password) {
      nextErrors.password = 'กรุณากรอกรหัสผ่าน';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const credentials = readFormCredentials();

    if (!validateForm(credentials.username, credentials.password)) {
      toast({
        title: 'ตรวจสอบข้อมูล',
        description: 'กรุณากรอกข้อมูลให้ครบถ้วนและถูกต้อง',
        variant: 'error',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      await login(credentials.username, credentials.password);

      if (rememberMe) {
        localStorage.setItem('jsk-remember-user', credentials.username);
      } else {
        localStorage.removeItem('jsk-remember-user');
      }

      toast({
        title: 'สำเร็จ',
        description: 'เข้าสู่ระบบสำเร็จ กำลังเปลี่ยนหน้า...',
        variant: 'success',
      });
      router.replace('/admin');
    } catch (error) {
      const errorInfo = getLoginErrorInfo(error);
      setLoginError(errorInfo.alertMessage);
      toast({
        title: errorInfo.toastTitle,
        description: errorInfo.toastDescription,
        variant: 'error',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isBusy = isSubmitting || isLoading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FAFAFA] dark:bg-slate-950 transition-colors duration-500 font-sans">
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('/noise.svg')] opacity-[0.03] mix-blend-overlay" />

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
        <div className="rounded-[2.5rem] border border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-3 relative group">
          <Card className="rounded-[2rem] border-slate-100/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 overflow-hidden shadow-2xl relative z-10 p-2 sm:p-4">
            <CardHeader className="space-y-6 flex flex-col items-center pb-6 pt-8">
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

              <form ref={formRef} onSubmit={handleSubmit} className="space-y-5" noValidate>
                <div className="space-y-2">
                  <Label
                    htmlFor="username"
                    className={cn(
                      'text-sm font-bold ml-1 transition-colors',
                      errors.username ? 'text-danger' : 'text-slate-700 dark:text-slate-300'
                    )}
                  >
                    ชื่อผู้ใช้ <span className="text-danger">*</span>
                  </Label>
                  <div className="relative group">
                    <Input
                      ref={usernameInputRef}
                      id="username"
                      name="username"
                      type="text"
                      placeholder="กรอกชื่อผู้ใช้ของคุณ"
                      onInput={() => clearFieldError('username')}
                      className={cn(
                        'pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-slate-200 dark:border-white/10 transition-all',
                        errors.username
                          ? 'border-danger focus:ring-danger focus:border-danger bg-danger/5'
                          : 'focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300'
                      )}
                      required
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <User
                      className={cn(
                        'absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors',
                        errors.username
                          ? 'text-danger'
                          : 'text-slate-400 group-focus-within:text-blue-600'
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="password"
                    className={cn(
                      'text-sm font-bold ml-1 transition-colors',
                      errors.password ? 'text-danger' : 'text-slate-700 dark:text-slate-300'
                    )}
                  >
                    รหัสผ่าน <span className="text-danger">*</span>
                  </Label>
                  <div className="relative group">
                    <Input
                      ref={passwordInputRef}
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      onInput={() => clearFieldError('password')}
                      className={cn(
                        'pl-11 pr-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-slate-200 dark:border-white/10 transition-all',
                        errors.password
                          ? 'border-danger focus:ring-danger focus:border-danger bg-danger/5'
                          : 'focus:ring-blue-500 focus:border-blue-500 hover:border-blue-300'
                      )}
                      required
                      autoComplete="current-password"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                    <Lock
                      className={cn(
                        'absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] transition-colors',
                        errors.password
                          ? 'text-danger'
                          : 'text-slate-400 group-focus-within:text-blue-600'
                      )}
                    />

                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      aria-pressed={showPassword}
                      aria-controls="password"
                      title={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-4.5 h-4.5" aria-hidden="true" />
                      ) : (
                        <Eye className="w-4.5 h-4.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
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

                <Button
                  type="submit"
                  disabled={isBusy}
                  className="w-full h-14 mt-4 rounded-full bg-blue-900 hover:bg-blue-800 text-white font-black text-base shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden cursor-pointer"
                  isLoading={isBusy}
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {isBusy ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                  </span>
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                </Button>
              </form>

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
