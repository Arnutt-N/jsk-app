import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  MessageCircle, Settings, ArrowRight, Bot, BarChart3, Users,
  Shield, Zap, Globe, Send, FileText, Headphones,
} from 'lucide-react';

const FEATURES = [
  {
    icon: Bot,
    title: 'Chatbot อัจฉริยะ',
    description: 'ตอบกลับอัตโนมัติด้วย Intent matching รองรับ Flex Message และ Rich Menu',
    color: 'text-brand-600',
    bg: 'bg-brand-50',
  },
  {
    icon: Headphones,
    title: 'Live Chat ทันที',
    description: 'เจ้าหน้าที่รับสายจาก LINE ผ่าน WebSocket พร้อม Queue, Transfer และ CSAT',
    color: 'text-info-dark',
    bg: 'bg-info/10',
  },
  {
    icon: BarChart3,
    title: 'Analytics ครบครัน',
    description: 'KPI แบบ real-time, FCR, SLA tracking, รายงานประสิทธิภาพ และ Audit Log',
    color: 'text-success-dark',
    bg: 'bg-success/10',
  },
  {
    icon: FileText,
    title: 'Service Request',
    description: 'รับเรื่อง ติดตาม ปิดงานด้วย Kanban board พร้อมระบบมอบหมายงาน',
    color: 'text-warning-dark',
    bg: 'bg-warning/10',
  },
  {
    icon: Shield,
    title: 'ปลอดภัยระดับองค์กร',
    description: 'JWT auth, role-based access control, credential encryption และ audit trail',
    color: 'text-danger-dark',
    bg: 'bg-danger/10',
  },
  {
    icon: Globe,
    title: 'Multi-Platform',
    description: 'เชื่อมต่อ LINE, Telegram, n8n workflow พร้อม Broadcast messaging',
    color: 'text-accent-dark',
    bg: 'bg-accent/10',
  },
];

const STATS = [
  { value: '24', label: 'Data Models', suffix: '' },
  { value: '17', label: 'Services', suffix: '' },
  { value: '25', label: 'API Endpoints', suffix: '+' },
  { value: '198', label: 'Automated Tests', suffix: '' },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-bg thai-text overflow-hidden">
      {/* Decorative background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-500/5 rounded-full blur-3xl -translate-y-1/3 translate-x-1/4" />
        <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-info/5 rounded-full blur-3xl translate-y-1/3 -translate-x-1/4" />
        <div className="absolute top-1/2 left-1/2 w-[300px] h-[300px] bg-accent/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-bg/80 border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl gradient-logo flex items-center justify-center text-white font-bold text-sm shadow-md shadow-brand-500/20">
              JS
            </div>
            <span className="font-semibold text-text-primary tracking-tight">JSK Platform</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-text-secondary">
            <a href="#features" className="hover:text-text-primary transition-colors">Features</a>
            <a href="#stats" className="hover:text-text-primary transition-colors">Stats</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </Link>
            <Link href="/admin">
              <Button size="sm" rightIcon={<ArrowRight className="w-3.5 h-3.5" />}>
                Dashboard
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative flex flex-col items-center justify-center min-h-[65vh] px-6 pt-16 pb-8 text-center">
        <Badge variant="primary" outline className="mb-8 px-4 py-1.5 text-sm animate-fade-in">
          <Zap className="w-3.5 h-3.5 mr-1.5" />
          JSK 4.0 Platform
        </Badge>

        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight leading-[1.1] animate-fade-in-up">
          <span className="text-text-primary">ระบบจัดการ</span>
          <br />
          <span className="text-gradient">LINE Official Account</span>
        </h1>

        <p className="text-lg md:text-xl text-text-secondary mb-4 max-w-2xl mx-auto leading-relaxed animate-fade-in-up">
          แพลตฟอร์มครบวงจรสำหรับงานยุติธรรมชุมชน
        </p>
        <p className="text-base text-text-tertiary mb-10 max-w-lg mx-auto animate-fade-in-up">
          Live Chat, Chatbot, Service Request, Analytics และ Broadcast ในที่เดียว
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center animate-fade-in-up">
          <Link href="/admin">
            <Button
              size="lg"
              className="w-full sm:w-auto"
              leftIcon={<Settings className="w-4 h-4" />}
              rightIcon={<ArrowRight className="w-4 h-4" />}
              glow
            >
              เข้าสู่ระบบ Admin
            </Button>
          </Link>
          <Link href="/liff/service-request">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto"
              leftIcon={<Send className="w-4 h-4" />}
            >
              แบบฟอร์ม LIFF
            </Button>
          </Link>
        </div>

        {/* Dashboard mockup hint */}
        <div className="mt-16 w-full max-w-4xl mx-auto animate-fade-in-up">
          <div className="relative rounded-2xl border border-border-default bg-surface shadow-2xl shadow-brand-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border-subtle bg-bg">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-danger/60" />
                <div className="w-3 h-3 rounded-full bg-warning/60" />
                <div className="w-3 h-3 rounded-full bg-success/60" />
              </div>
              <div className="flex-1 mx-12">
                <div className="h-5 bg-muted rounded-md max-w-xs mx-auto" />
              </div>
            </div>
            <div className="p-6 grid grid-cols-4 gap-4">
              {[
                { label: 'Total Requests', val: '4,521', trend: '+12%', color: 'brand' },
                { label: 'Active Chats', val: '23', trend: '3 urgent', color: 'info' },
                { label: 'Avg Response', val: '1.2m', trend: '-8%', color: 'success' },
                { label: 'CSAT Score', val: '4.5', trend: '127 reviews', color: 'warning' },
              ].map((stat) => (
                <div key={stat.label} className="rounded-xl bg-bg p-4 border border-border-subtle">
                  <div className="text-xs text-text-tertiary mb-1">{stat.label}</div>
                  <div className="text-xl font-bold text-text-primary font-mono">{stat.val}</div>
                  <div className="text-xs text-text-tertiary mt-1">{stat.trend}</div>
                </div>
              ))}
            </div>
            <div className="px-6 pb-6 grid grid-cols-3 gap-4">
              <div className="col-span-2 h-32 rounded-xl bg-muted/50 border border-border-subtle" />
              <div className="h-32 rounded-xl bg-muted/50 border border-border-subtle" />
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section id="stats" className="py-16 border-y border-border-subtle bg-surface/50">
        <div className="max-w-4xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <div className="text-3xl md:text-4xl font-bold text-text-primary font-mono tracking-tight">
                {stat.value}{stat.suffix}
              </div>
              <div className="text-sm text-text-tertiary mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 max-w-6xl mx-auto">
        <div className="text-center mb-14">
          <Badge variant="secondary" className="mb-4">Features</Badge>
          <h2 className="text-3xl md:text-4xl font-bold text-text-primary mb-4 tracking-tight">
            ทุกอย่างที่ต้องการ
          </h2>
          <p className="text-text-secondary max-w-lg mx-auto">
            ระบบจัดการ LINE OA ครบวงจร ตั้งแต่ Chatbot ถึง Analytics
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                variant="default"
                className="group hover:-translate-y-1 hover:shadow-lg transition-all duration-200"
              >
                <CardContent className="p-6">
                  <div className={`w-11 h-11 rounded-xl ${feature.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className={`w-5 h-5 ${feature.color}`} />
                  </div>
                  <h3 className="font-semibold text-text-primary mb-2 thai-no-break">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-text-primary mb-4 tracking-tight">
            พร้อมเริ่มใช้งาน?
          </h2>
          <p className="text-text-secondary mb-8 max-w-md mx-auto">
            เข้าสู่ระบบ Admin Panel เพื่อจัดการ LINE OA ของคุณได้ทันที
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link href="/login">
              <Button size="lg" glow rightIcon={<ArrowRight className="w-4 h-4" />}>
                เข้าสู่ระบบ
              </Button>
            </Link>
            <Link href="/liff/service-request">
              <Button variant="ghost" size="lg" leftIcon={<MessageCircle className="w-4 h-4" />}>
                ส่งคำขอบริการ
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-border-subtle">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-lg gradient-logo flex items-center justify-center text-white font-bold text-[10px]">
              JS
            </div>
            <span className="text-sm text-text-tertiary">JSK 4.0 Platform</span>
          </div>
          <p className="text-xs text-text-tertiary">
            &copy; 2026 Community Justice Services &middot; กรมคุ้มครองสิทธิและเสรีภาพ
          </p>
        </div>
      </footer>
    </main>
  );
}
