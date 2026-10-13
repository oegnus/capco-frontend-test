export function rateLimitMessage(retryAfterSeconds?: number): string {
  if (retryAfterSeconds === undefined) {
    return 'Too many attempts. Wait a moment, then try again.'
  }
  const minutes = Math.ceil(retryAfterSeconds / 60)
  const wait =
    retryAfterSeconds < 60
      ? `${retryAfterSeconds} ${retryAfterSeconds === 1 ? 'second' : 'seconds'}`
      : `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`
  return `Too many attempts. Try again in ${wait}.`
}
