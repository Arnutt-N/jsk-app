'use client';

import dynamic from 'next/dynamic';

// Dynamic import for Charts (Client Component) with SSR disabled
const DashboardCharts = dynamic(
    () => import('./DashboardCharts'),
    {
        ssr: false,
        loading: () => <div className="h-[300px] w-full bg-muted animate-pulse rounded-xl" />
    }
);

interface ChartsWrapperProps {
    statusData: Array<{ name: string; value: number }>;
    monthlyData: Array<{ month: string; count: number }>;
}

export default function ChartsWrapper(props: ChartsWrapperProps) {
    return <DashboardCharts {...props} />;
}
