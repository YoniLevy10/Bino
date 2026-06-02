/** Haversine distance in meters between two WGS84 points. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function isOutsideGeofence(
  lat: number,
  lng: number,
  centerLat: number | null | undefined,
  centerLng: number | null | undefined,
  radiusM: number | null | undefined
): boolean {
  if (centerLat == null || centerLng == null || radiusM == null || radiusM <= 0) return false
  return distanceMeters(lat, lng, centerLat, centerLng) > radiusM
}

export function mapsLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}
