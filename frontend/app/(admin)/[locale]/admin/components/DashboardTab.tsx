'use client';

import React from 'react';
import Link from 'next/link';
import { Package, ShoppingCart, Users, TrendingUp, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { ORDER_STATUS_LABELS } from '@/lib/constants';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

export default function DashboardTab() {
  const { user, isAuthenticated } = useAuthStore();
  const t = useTranslations('admin');

  const { data: dashboard } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/admin/dashboard');
      return data;
    },
    enabled: isAuthenticated && ['admin', 'manager', 'operator'].includes(user?.role ?? ''),
    refetchInterval: 30000,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['admin-dashboard-orders'],
    queryFn: async () => {
      const { data } = await api.get('/admin/orders', { params: { page: 1, page_size: 10 } });
      return data;
    },
    enabled: isAuthenticated && ['admin', 'manager', 'operator'].includes(user?.role ?? ''),
  });
  const orders = ordersData?.items;

  const stats = [
    { icon: ShoppingCart, label: t('orders_count'), value: dashboard?.total_orders ?? 0, color: 'text-blue-600' },
    { icon: Users, label: t('users_count'), value: dashboard?.total_users ?? 0, color: 'text-green-600' },
    { icon: Package, label: t('parts_count'), value: dashboard?.total_parts?.toLocaleString() ?? 0, color: 'text-purple-600' },
    { icon: TrendingUp, label: t('total_revenue'), value: dashboard?.total_revenue ? `${Number(dashboard.total_revenue).toLocaleString()} ₴` : '0', color: 'text-orange-600' },
  ];

  const barChartOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dashboard?.orders_by_date?.map((d: any) => d.date.slice(5)) || [],
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [{
      type: 'bar',
      data: dashboard?.orders_by_date?.map((d: any) => d.count) || [],
      itemStyle: { color: '#3b82f6', borderRadius: [4, 4, 0, 0] },
    }],
  };

  const donutOption = {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: true,
      label: { show: true, position: 'outside', fontSize: 11 },
      emphasis: { label: { show: true, fontSize: 14 } },
      data: Object.entries(dashboard?.orders_by_status || {}).map(([key, val]) => ({
        name: key,
        value: val,
      })),
    }],
  };

  const lineChartOption = {
    tooltip: { trigger: 'axis', valueFormatter: (v: any) => `${Number(v).toLocaleString()} ₴` },
    grid: { left: 60, right: 20, top: 30, bottom: 30 },
    xAxis: {
      type: 'category',
      data: dashboard?.orders_by_date?.map((d: any) => d.date.slice(5)) || [],
      axisLabel: { fontSize: 11 },
    },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => `${(v / 1000).toFixed(0)}k` } },
    series: [{
      type: 'line',
      data: dashboard?.orders_by_date?.map((d: any) => d.revenue) || [],
      smooth: true,
      lineStyle: { color: '#22c55e', width: 2 },
      itemStyle: { color: '#22c55e' },
      areaStyle: { color: 'rgba(34,197,94,0.1)' },
    }],
  };

  const categoryBarOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'value', minInterval: 1 },
    yAxis: {
      type: 'category',
      data: dashboard?.parts_by_category?.map((d: any) => d.category).reverse() || [],
      axisLabel: { fontSize: 11 },
    },
    series: [{
      type: 'bar',
      data: dashboard?.parts_by_category?.map((d: any) => d.count).reverse() || [],
      itemStyle: { color: '#a855f7', borderRadius: [0, 4, 4, 0] },
    }],
  };

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className={`${stat.color} bg-muted p-3 rounded-lg`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('orders_by_day')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={barChartOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('orders_by_status')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={donutOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('revenue_by_day')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={lineChartOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">{t('parts_by_category')}</CardTitle></CardHeader>
          <CardContent>
            <ReactECharts option={categoryBarOption} style={{ height: 260 }} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('recent_orders')}</CardTitle>
        </CardHeader>
        <CardContent>
          {orders?.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t('no_orders')}</p>
          ) : (
            <div className="divide-y text-sm">
              {orders?.map((order: any) => {
                const variant = ORDER_STATUS_LABELS[order.status]?.variant || 'secondary';
                return (
                  <div key={order.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="font-mono font-medium">#{order.id}</span>
                      <span className="text-muted-foreground">{order.full_name}</span>
                      <Badge variant={variant}>{t('order_' + order.status)}</Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium">{Number(order.total).toLocaleString()} ₴</span>
                      <Link href={`/orders/${order.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
