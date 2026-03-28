'use client';

import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from './Button';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** render-prop fallback — รับ error และ reset function เพื่อสร้าง UI เอง */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
}

/** Discriminated union — ป้องกัน state ที่ขัดแย้งกัน (hasError=true แต่ error=null) */
type ErrorBoundaryState =
  | { readonly hasError: false; readonly error: null; readonly retryCount: number }
  | { readonly hasError: true; readonly error: Error; readonly retryCount: number };

const MAX_RETRIES = 3;

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, retryCount: 0 };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error, retryCount: 0 };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] จับ error ได้:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  handleReset = () => {
    this.setState(prev => ({
      hasError: false,
      error: null,
      retryCount: prev.retryCount + 1,
    }));
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;

      // render-prop fallback — ส่ง error และ reset function ให้ parent จัดการเอง
      if (typeof fallback === 'function') {
        return fallback(this.state.error, this.handleReset);
      }
      // static ReactNode fallback
      if (fallback) {
        return fallback;
      }

      const exceededRetries = this.state.retryCount >= MAX_RETRIES;

      return (
        <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">
            เกิดข้อผิดพลาด
          </h3>
          <p className="text-sm text-text-secondary max-w-sm mb-4">
            {exceededRetries
              ? 'ข้อผิดพลาดยังคงอยู่ กรุณาติดต่อผู้ดูแลระบบ หรือกลับหน้าหลัก'
              : 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง'}
          </p>
          {/* แสดง error detail เฉพาะ development เท่านั้น */}
          {process.env.NODE_ENV === 'development' && this.state.error.message && (
            <pre className="text-xs text-danger bg-danger/5 p-2 rounded mb-4 max-w-sm overflow-auto">
              {this.state.error.message}
            </pre>
          )}
          <div className="flex gap-2">
            {exceededRetries ? (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Home size={16} />}
                onClick={() => { window.location.href = '/admin'; }}
              >
                กลับหน้าหลัก
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw size={16} />}
                onClick={this.handleReset}
              >
                ลองใหม่ ({this.state.retryCount + 1}/{MAX_RETRIES})
              </Button>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
