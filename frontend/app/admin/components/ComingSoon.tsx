'use client';

import { Rocket, ArrowLeft, Bell } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function ComingSoonPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[70vh] text-center px-6 animate-in fade-in duration-500">

            <div className="relative group">
                <div className="w-24 h-24 bg-brand-50 border border-brand-100 rounded-[2.5rem] flex items-center justify-center mb-8 cursor-default dark:bg-brand-900/20 dark:border-brand-800/30">
                    <Rocket className="w-10 h-10 text-brand-500 animate-float dark:text-brand-400" />
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
            <div className="mt-20 flex items-center gap-6 text-xs font-medium text-text-tertiary border-t border-border-subtle pt-8 w-full max-w-xs justify-center">
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
