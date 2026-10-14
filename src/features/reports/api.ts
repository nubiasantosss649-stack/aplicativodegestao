import { useQuery } from '@tanstack/react-query';

import type { DateRange } from '@/lib/dates';
import { supabase, unwrap } from '@/lib/supabase';

export interface SalesReport {
  period: { from: string; to: string };
  summary: {
    sales_count: number;
    revenue_cents: number;
    discount_cents: number;
    credit_sales_cents: number;
    average_ticket_cents: number;
    items_sold: number;
    cogs_cents: number | null;
    gross_profit_cents: number | null;
    gross_margin_pct: number | null;
    canceled_count: number;
    canceled_cents: number;
  };
  previous_period: { revenue_cents: number; sales_count: number; revenue_change_pct: number | null };
  by_product: {
    product_id: string | null;
    name: string;
    quantity: number;
    revenue_cents: number;
    cost_cents: number | null;
    profit_cents: number | null;
    margin_pct: number | null;
  }[];
  by_category: { category: string; quantity: number; revenue_cents: number; profit_cents: number | null }[];
  by_payment_method: { method: 'cash' | 'pix' | 'card' | 'credit'; total_cents: number; sales_count: number }[];
  by_weekday: { weekday: number; revenue_cents: number; sales_count: number }[];
  by_hour: { hour: number; revenue_cents: number; sales_count: number }[];
  top_customers: { customer_id: string; name: string; revenue_cents: number; sales_count: number }[];
}

export type StockStatus = 'out_of_stock' | 'below_minimum' | 'ending_soon' | 'stale';

export interface StockRecommendations {
  method: string;
  items: {
    product_id: string;
    name: string;
    unit: string;
    status: StockStatus;
    stock_qty: number;
    min_stock: number;
    sold_30d: number;
    avg_daily: number;
    days_of_cover: number | null;
    suggested_qty: number;
    suggested_cost_cents: number;
    stale_value_cents: number;
  }[];
}

export interface PricingProduct {
  id: string;
  name: string;
  cost_cents: number;
  price_cents: number;
  margin_pct: number | null;
  suggested_price_cents: number;
}

export interface PricingInsights {
  target_margin_pct: number;
  method: string;
  below_cost: PricingProduct[];
  low_margin: PricingProduct[];
  missing_cost: { id: string; name: string }[];
  healthy_count: number;
}

export interface BusinessAlert {
  severity: 'high' | 'medium' | 'low';
  code: string;
  title: string;
  detail: string;
  value_cents: number | null;
}

export function useSalesReport(businessId: string, range: DateRange, enabled = true) {
  return useQuery({
    queryKey: ['sales', businessId, 'report', range],
    enabled,
    queryFn: async () =>
      unwrap<SalesReport>(await supabase.rpc('sales_report', { p_business_id: businessId, p_from: range.from, p_to: range.to })),
  });
}

export function useStockRecommendations(businessId: string, enabled = true) {
  return useQuery({
    queryKey: ['products', businessId, 'recommendations'],
    enabled,
    queryFn: async () =>
      unwrap<StockRecommendations>(await supabase.rpc('stock_recommendations', { p_business_id: businessId })),
  });
}

export function usePricingInsights(businessId: string, targetMargin: number, enabled = true) {
  return useQuery({
    queryKey: ['products', businessId, 'pricing', targetMargin],
    enabled,
    queryFn: async () =>
      unwrap<PricingInsights>(
        await supabase.rpc('pricing_insights', { p_business_id: businessId, p_target_margin: targetMargin }),
      ),
  });
}

export function useBusinessAlerts(businessId: string, enabled = true) {
  return useQuery({
    queryKey: ['dashboard', businessId, 'alerts'],
    enabled,
    queryFn: async () =>
      unwrap<{ alerts: BusinessAlert[] }>(await supabase.rpc('business_alerts', { p_business_id: businessId })).alerts,
  });
}

export async function fetchBusinessExport(businessId: string): Promise<Record<string, unknown>> {
  return unwrap<Record<string, unknown>>(await supabase.rpc('export_business_data', { p_business_id: businessId }));
}

export const WEEKDAYS = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
