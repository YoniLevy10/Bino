/** Deep-link into /tickets filtered by building. Prefer project_code (UI filter key). */
export function ticketsHrefForProject(projectId: string, projectCode?: string | null): string {
  const code = (projectCode || '').trim()
  if (code) return `/tickets?project=${encodeURIComponent(code)}`
  return `/tickets?project_id=${encodeURIComponent(projectId)}`
}
