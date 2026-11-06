import { TicketsGate } from './tickets-gate'
import { TicketsShell } from './tickets-shell'

export default function TicketsPage() {
  return (
    <>
      <TicketsShell />
      <TicketsGate />
    </>
  )
}
