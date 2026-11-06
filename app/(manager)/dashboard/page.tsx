import { DashboardGate } from './dashboard-gate'
import { DashboardShell } from './dashboard-shell'

export default function DashboardPage() {
  return (
    <div className="kiss-home">
      <DashboardShell />
      <DashboardGate />
    </div>
  )
}
