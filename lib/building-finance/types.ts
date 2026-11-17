export type BuildingExpensePaymentStatus = 'unpaid' | 'partial' | 'paid' | 'void'

export type BuildingExpenseRow = {
  id: string
  client_id: string
  project_id: string
  category_id: string | null
  vendor_name: string | null
  professional_id: string | null
  ticket_id: string | null
  amount: number
  currency: string
  expense_date: string
  description: string | null
  receipt_url: string | null
  payment_status: BuildingExpensePaymentStatus
  budget_period_key: string | null
  idempotency_key: string
  created_at: string
  voided_at: string | null
}

export type BuildingExpenseCategoryRow = {
  id: string
  client_id: string
  project_id: string | null
  key: string
  name_he: string
  is_system: boolean
  sort_order: number
}

export type BuildingBudgetRow = {
  id: string
  client_id: string
  project_id: string
  period_key: string
  category_id: string | null
  amount_planned: number
  currency: string
}

export type BudgetUtilization = {
  period_key: string
  planned: number
  spent: number
  remaining: number
  utilization_pct: number | null
  over_pace: boolean
}
