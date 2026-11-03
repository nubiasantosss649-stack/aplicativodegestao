/**
 * Tipos das tabelas usadas pelo app (espelham supabase/migrations).
 * Valores monetários em centavos; quantidades como number.
 * Para gerar os tipos completos: npx supabase gen types typescript --project-id <id>
 */

export type BusinessRole = 'owner' | 'manager' | 'seller';
export type DocumentType = 'cpf' | 'cnpj';
export type StockMovementType = 'initial' | 'purchase' | 'adjustment' | 'sale' | 'sale_cancel';
export type SaleStatus = 'completed' | 'canceled';
export type PaymentMethod = 'cash' | 'pix' | 'card' | 'credit';
export type ReceivableStatus = 'open' | 'partial' | 'paid' | 'canceled';
export type FinanceKind = 'income' | 'expense';
export type FinanceStatus = 'pending' | 'paid' | 'canceled';

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
}

export interface Business {
  id: string;
  owner_id: string;
  name: string;
  business_type: string;
  document_type: DocumentType | null;
  document: string | null;
  phone: string | null;
  currency: string;
  timezone: string;
  allow_negative_stock: boolean;
  seller_max_discount_percent: number;
  default_credit_days: number;
  receipt_footer: string | null;
  created_at: string;
}

export interface BusinessMembership {
  business_id: string;
  user_id: string;
  role: BusinessRole;
  businesses: Business;
}

export interface ProductCategory {
  id: string;
  business_id: string;
  name: string;
}

export interface Product {
  id: string;
  business_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  internal_code: string | null;
  barcode: string | null;
  unit: string;
  cost_cents: number;
  price_cents: number;
  stock_qty: number;
  min_stock: number;
  track_stock: boolean;
  photo_path: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  balance_after: number;
  unit_cost_cents: number | null;
  reason: string | null;
  sale_id: string | null;
  created_at: string;
}

export interface Customer {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
}

export interface CustomerBalance {
  customer_id: string;
  name: string;
  phone: string | null;
  balance_cents: number;
  overdue_cents: number;
  oldest_due_date: string | null;
  total_spent_cents: number;
  purchases_count: number;
  last_purchase_at: string | null;
}

export interface Sale {
  id: string;
  business_id: string;
  number: number;
  customer_id: string | null;
  status: SaleStatus;
  subtotal_cents: number;
  discount_cents: number;
  total_cents: number;
  cost_cents: number;
  received_cents: number;
  credit_cents: number;
  notes: string | null;
  created_at: string;
  canceled_at: string | null;
  cancel_reason: string | null;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price_cents: number;
  unit_cost_cents: number;
  discount_cents: number;
  total_cents: number;
}

export interface SalePayment {
  id: string;
  sale_id: string;
  method: PaymentMethod;
  amount_cents: number;
}

export interface SaleDetail extends Sale {
  customers: Pick<Customer, 'id' | 'name' | 'phone'> | null;
  sale_items: SaleItem[];
  sale_payments: SalePayment[];
}

export interface Receivable {
  id: string;
  business_id: string;
  customer_id: string;
  sale_id: string | null;
  description: string;
  amount_cents: number;
  paid_cents: number;
  due_date: string;
  status: ReceivableStatus;
  created_at: string;
}

export interface ReceivablePayment {
  id: string;
  receivable_id: string;
  customer_id: string;
  amount_cents: number;
  method: PaymentMethod;
  paid_at: string;
  notes: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
}

export interface FinanceCategory {
  id: string;
  business_id: string;
  kind: FinanceKind;
  name: string;
}

export interface FinancialEntry {
  id: string;
  business_id: string;
  kind: FinanceKind;
  category_id: string | null;
  description: string;
  amount_cents: number;
  competence_date: string;
  due_date: string | null;
  status: FinanceStatus;
  paid_at: string | null;
  method: PaymentMethod | null;
  notes: string | null;
  created_at: string;
  finance_categories?: Pick<FinanceCategory, 'name'> | null;
}

export interface DashboardSummary {
  period: { from: string; to: string };
  today: { sales_count: number; revenue_cents: number };
  sales_count: number;
  revenue_cents: number;
  cogs_cents: number;
  credit_sales_cents: number;
  average_ticket_cents: number;
  received_cents: number;
  received_breakdown: { sales: number; receivables: number; other_income: number };
  expenses_cents: number | null;
  estimated_profit_cents: number | null;
  receivables_open_cents: number;
  receivables_overdue_cents: number;
  overdue_customers: number;
  low_stock_count: number;
  low_stock: { id: string; name: string; stock_qty: number; min_stock: number; unit: string }[];
  daily: { day: string; total_cents: number; sales_count: number }[];
  top_products: { product_id: string | null; name: string; quantity: number; total_cents: number }[];
  recent: {
    kind: 'sale' | 'receivable_payment' | 'income' | 'expense';
    id: string;
    at: string;
    amount_cents: number;
    description: string;
    status: string;
  }[];
}

export interface FinanceSummary {
  revenue_cents: number;
  cogs_cents: number;
  gross_profit_cents: number;
  expenses_cents: number;
  net_profit_cents: number;
  cash_in_cents: number;
  cash_in_breakdown: { sales: number; receivables: number; other_income: number };
  cash_out_cents: number;
  cash_balance_cents: number;
  expenses_by_category: { category: string; total_cents: number }[];
  received_by_method: { method: PaymentMethod; total_cents: number }[];
  payables_open_cents: number;
  payables_overdue_cents: number;
  payables_overdue_count: number;
}
