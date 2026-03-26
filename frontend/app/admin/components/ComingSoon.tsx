'use client';

import { Rocket, ArrowLeft, Bell, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ComingSoonPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 animate-in fade-in zoom-in duration-700">
            {/* Ambient Background Glows */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-500/10 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute top-1/4 left-1/3 w-[300px] h-[300px] bg-brand-500/5 rounded-full blur-[100px] pointer-events-none" />

            <div className="relative group">
                {/* Icon Container with Glassmorphism */}
                <div className="w-24 h-24 bg-white/40 backdrop-blur-xl border border-white/60 shadow-2xl shadow-brand-500/10 rounded-[2.5rem] flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500 cursor-default dark:bg-gray-800/40 dark:border-gray-700/60">
                    <Rocket className="w-10 h-10 text-brand-500 animate-bounce dark:text-brand-400" />
                    <Sparkles className="absolute -top-2 -right-2 w-6 h-6 text-warning animate-pulse" />
                </div>
            </div>

            <div className="space-y-4 max-w-lg relative">
                <div className="space-y-2">
                    <span className="px-4 py-1.5 bg-brand-500/8 text-brand-600 text-[10px] font-black uppercase tracking-[0.3em] rounded-full border border-brand-500/15 shadow-sm dark:text-brand-400">
                        In Development
                    </span>
                    <h1 className="text-4xl md:text-5xl font-black text-text-primary tracking-tighter leading-none pt-2">
                        Coming Soon
                    </h1>
                    <h2 className="text-xl md:text-2xl font-bold text-text-tertiary mt-[-4px]">
                        ฟีเจอร์นี้กำลังอยู่ระหว่างการพัฒนา
                    </h2>
                </div>

                <p className="text-text-secondary text-sm md:text-base leading-relaxed max-w-sm mx-auto font-medium">
                    เรากำลังดำเนินการเพิ่มฟีเจอร์นี้เพื่อให้ระบบ JSK Admin ทำงานได้ครบวงจรยิ่งขึ้น คอยพบกับการอัปเดตในเวอร์ชั่นถัดไป
                </p>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
                    <Button
                        variant="outline"
                        size="lg"
                        leftIcon={<ArrowLeft className="w-4 h-4" />}
                        onClick={() => window.history.back()}
                        className="w-full sm:w-auto"
                    >
                        ย้อนกลับ (Go Back)
                    </Button>
                    <Button
                        variant="primary"
                        size="lg"
                        leftIcon={<Bell className="w-4 h-4" />}
                        className="w-full sm:w-auto"
                    >
                        แจ้งเตือนเมื่อเปิดใช้
                    </Button>
                </div>
            </div>

            {/* Bottom Status Info */}
            <div className="mt-20 flex items-center gap-6 text-[10px] font-bold text-text-tertiary uppercase tracking-widest border-t border-border-subtle pt-8 w-full max-w-xs justify-center">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-success rounded-full animate-pulse" />
                    Version 1.2
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
                    Priority: High
                </div>
            </div>
        </div>
    );
}
