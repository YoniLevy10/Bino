import { NextResponse } from 'next/server'

/**
 * Email magic-link is not a resident entry path.
 * Residents sign in only from the building join link (`/resident/join/[projectId]`).
 */
export async function POST() {
  return NextResponse.json(
    { error: 'הכניסה לפורטל הדיירים אפשרית רק דרך הקישור הייעודי לבניין.' },
    { status: 403 }
  )
}
