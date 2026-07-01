/** Supabase/PostgREST returns at most 1000 rows per request — paginate until exhausted. */
const PAGE_SIZE = 1000

type PageResult<T> = {
  data: T[] | null
  error: { message?: string } | null
}

export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<PageResult<T>>
): Promise<T[]> {
  const all: T[] = []
  let offset = 0

  while (true) {
    const { data, error } = await buildQuery(offset, offset + PAGE_SIZE - 1)
    if (error) throw error
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return all
}
