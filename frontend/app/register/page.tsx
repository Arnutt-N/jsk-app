'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import {
  User,
  Lock,
  Mail,
  Building2,
  MapPin,
  Briefcase,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formData, setFormData] = useState({
    // User Info
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    
    // Agency Info
    sectorType: '',
    ministry: '',
    department: '',
    bureau: '', // สำนัก/กอง
    division: '', // กลุ่ม/ฝ่าย
    legalAgency: '', // หน่วยงานตามกฎหมาย
    assignedAgency: '', // หน่วยงานตามมอบหมายงาน
    
    // Location Info
    province: '',
    district: '',
    subDistrict: '',
    provincialCluster: '', // กลุ่มจังหวัด
    provincialZone: '', // เขตจังหวัด
    inspectionZone: '', // เขตตรวจราชการ
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'รหัสผ่านไม่ตรงกัน',
        description: 'กรุณาตรวจสอบรหัสผ่านและยืนยันรหัสผ่านอีกครั้ง',
        variant: 'error',
      });
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsSubmitting(false);
      toast({
        title: 'ลงทะเบียนสำเร็จ',
        description: 'ระบบได้รับข้อมูลการลงทะเบียนของท่านแล้ว กรุณารอการอนุมัติจากผู้ดูแลระบบ',
        variant: 'success',
      });
      router.push('/login');
    }, 1500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative overflow-hidden bg-[#FAFAFA] dark:bg-slate-950 transition-colors duration-500 font-sans">
      {/* Shared Background with Landing Page */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center overflow-hidden">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03] mix-blend-overlay" />

        {/* Animated Orbs */}
        <motion.div
          animate={{ y: [0, 50, 0], x: [0, 30, 0], scale: [1, 1.1, 1] }}
          transition={{ duration: 20, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-[-10%] left-[-5%] w-[800px] h-[800px] bg-blue-900/10 dark:bg-blue-400/10 blur-[120px] rounded-full"
        />
        <motion.div
          animate={{ y: [0, -40, 0], x: [0, -20, 0], scale: [1, 1.05, 1] }}
          transition={{ duration: 25, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-[-10%] right-[-5%] w-[700px] h-[700px] bg-blue-400/10 dark:bg-blue-900/15 blur-[120px] rounded-full"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 w-full max-w-4xl"
      >
        <div className="rounded-[2.5rem] border border-white/60 dark:border-white/10 bg-white/30 dark:bg-white/5 backdrop-blur-3xl shadow-[0_40px_100px_-20px_rgba(0,0,0,0.1)] p-3 relative group">
          <Card className="rounded-[2rem] border-slate-100/80 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 overflow-hidden shadow-2xl relative z-10 p-4 sm:p-8">
            <CardHeader className="space-y-6 flex flex-col items-center pb-8 pt-4 border-b border-slate-100 dark:border-white/5">
              <Link href="/" className="transition-transform hover:scale-105 duration-300 cursor-pointer">
                <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-blue-800/30 bg-gradient-to-br from-blue-900 to-blue-700 text-sm font-bold tracking-[0.24em] text-white shadow-lg shadow-blue-900/20">
                  <span className="ml-[0.24em]">JSK</span>
                  <span className="absolute inset-x-3 bottom-2 h-[2px] rounded-full bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-70" />
                </div>
              </Link>

              <div className="space-y-2 text-center">
                <CardTitle className="font-heading text-3xl font-black tracking-tight">
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-950 to-blue-500 dark:from-blue-300 dark:to-blue-500">
                    ลงทะเบียนเจ้าหน้าที่
                  </span>
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400 font-medium text-base">
                  กรอกข้อมูลเพื่อขอสิทธิ์การเข้าใช้งานระบบ JSK 4.0 Platform
                </CardDescription>
              </div>
            </CardHeader>

            <CardContent className="pt-8">
              <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* Section 1: ข้อมูลผู้ใช้งาน */}
                <div className="space-y-6">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <User className="w-4 h-4" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">1. ข้อมูลผู้ใช้งาน</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="fullName" className="text-sm font-bold text-slate-700 dark:text-slate-300">ชื่อ-นามสกุล <span className="text-danger">*</span></Label>
                      <Input
                        id="fullName" name="fullName" required
                        placeholder="นายทดสอบ ระบบงาน"
                        value={formData.fullName} onChange={handleChange}
                        className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-slate-200 dark:border-white/10 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-sm font-bold text-slate-700 dark:text-slate-300">อีเมล (ชื่อผู้ใช้) <span className="text-danger">*</span></Label>
                      <div className="relative group">
                        <Input
                          id="email" name="email" type="email" required
                          placeholder="officer@example.com"
                          value={formData.email} onChange={handleChange}
                          className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-slate-200 dark:border-white/10 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600" />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-sm font-bold text-slate-700 dark:text-slate-300">รหัสผ่าน <span className="text-danger">*</span></Label>
                      <div className="relative group">
                        <Input
                          id="password" name="password" type={showPassword ? 'text' : 'password'} required
                          placeholder="••••••••"
                          value={formData.password} onChange={handleChange}
                          className="pl-11 pr-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-slate-200 dark:border-white/10 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600">
                          {showPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-sm font-bold text-slate-700 dark:text-slate-300">ยืนยันรหัสผ่าน <span className="text-danger">*</span></Label>
                      <div className="relative group">
                        <Input
                          id="confirmPassword" name="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required
                          placeholder="••••••••"
                          value={formData.confirmPassword} onChange={handleChange}
                          className="pl-11 pr-12 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl border-slate-200 dark:border-white/10 focus:ring-blue-500 focus:border-blue-500"
                        />
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600" />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600">
                          {showConfirmPassword ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: ข้อมูลหน่วยงาน */}
                <div className="space-y-6 pt-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                      <Building2 className="w-4 h-4" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">2. ข้อมูลหน่วยงาน</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div className="space-y-2 lg:col-span-3">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">ส่วนราชการ <span className="text-danger">*</span></Label>
                      <select 
                        name="sectorType" value={formData.sectorType} onChange={handleChange} required
                        className="w-full h-12 px-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-white/10 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-slate-700 dark:text-slate-200 appearance-none"
                      >
                        <option value="" disabled>-- เลือกส่วนราชการ --</option>
                        <option value="central">ส่วนกลาง</option>
                        <option value="provincial">ส่วนภูมิภาค</option>
                        <option value="central_in_provincial">ส่วนกลางที่ตั้งอยู่ในส่วนภูมิภาค</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">กระทรวง <span className="text-danger">*</span></Label>
                      <Input name="ministry" placeholder="เช่น กระทรวงยุติธรรม" value={formData.ministry} onChange={handleChange} required className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">กรม <span className="text-danger">*</span></Label>
                      <Input name="department" placeholder="เช่น กรมคุมประพฤติ" value={formData.department} onChange={handleChange} required className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">สำนัก/กอง</Label>
                      <Input name="bureau" placeholder="ระบุสำนักหรือกอง (ถ้ามี)" value={formData.bureau} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">กลุ่ม/ฝ่าย</Label>
                      <Input name="division" placeholder="ระบุกลุ่มหรือฝ่าย (ถ้ามี)" value={formData.division} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">หน่วยงานตามกฎหมาย</Label>
                      <div className="relative group">
                        <Input name="legalAgency" placeholder="ระบุหน่วยงานตามกฎหมาย" value={formData.legalAgency} onChange={handleChange} className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">หน่วยงานตามมอบหมายงาน</Label>
                      <div className="relative group">
                        <Input name="assignedAgency" placeholder="ระบุหน่วยงานที่ได้รับมอบหมาย" value={formData.assignedAgency} onChange={handleChange} className="pl-11 h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                        <Briefcase className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-slate-400 group-focus-within:text-blue-600" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 3: ข้อมูลพื้นที่ */}
                <div className="space-y-6 pt-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100 dark:border-white/5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <MapPin className="w-4 h-4" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 dark:text-slate-200">3. ข้อมูลพื้นที่ราชการ</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">จังหวัด</Label>
                      <Input name="province" placeholder="ระบุจังหวัด" value={formData.province} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">อำเภอ</Label>
                      <Input name="district" placeholder="ระบุอำเภอ" value={formData.district} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">ตำบล</Label>
                      <Input name="subDistrict" placeholder="ระบุตำบล" value={formData.subDistrict} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">กลุ่มจังหวัด</Label>
                      <Input name="provincialCluster" placeholder="เช่น กลุ่มจังหวัดภาคตะวันออกเฉียงเหนือตอนบน 2" value={formData.provincialCluster} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">เขตจังหวัด</Label>
                      <Input name="provincialZone" placeholder="ระบุเขตจังหวัด" value={formData.provincialZone} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-sm font-bold text-slate-700 dark:text-slate-300">เขตตรวจราชการ</Label>
                      <Input name="inspectionZone" placeholder="เช่น เขตตรวจราชการที่ 11" value={formData.inspectionZone} onChange={handleChange} className="h-12 bg-slate-50 dark:bg-slate-800/50 rounded-xl" />
                    </div>
                  </div>
                </div>

                <div className="pt-8 border-t border-slate-100 dark:border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <Link href="/login" className="w-full sm:w-auto text-sm font-bold text-slate-500 hover:text-blue-900 dark:text-slate-400 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2 h-14 px-6 rounded-full border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <ArrowLeft className="w-4 h-4" />
                    กลับไปหน้าเข้าสู่ระบบ
                  </Link>

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full sm:w-auto h-14 px-10 rounded-full bg-blue-900 hover:bg-blue-800 text-white font-black text-base shadow-lg shadow-blue-900/20 hover:shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all group overflow-hidden cursor-pointer"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      {isSubmitting ? 'กำลังบันทึกข้อมูล...' : 'ยืนยันการลงทะเบียน'}
                      {!isSubmitting && <CheckCircle2 className="w-5 h-5 ml-1" />}
                    </span>
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-blue-800 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Copyright */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-8 flex flex-col items-center gap-4"
        >
          <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium text-center">
            Copyright 2026 สำนักงานยุติธรรมจังหวัดสกลนคร สำนักงานปลัดกระทรวงยุติธรรม
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
