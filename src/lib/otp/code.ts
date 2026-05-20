// Cryptographically secure 6-digit numeric OTP, returned as a zero-padded
// string so leading zeros survive (e.g. "012345"). NEVER use Math.random().
//
// Rejection sampling eliminates modulo bias: draws from crypto.getRandomValues
// are discarded if they fall in the final partial bucket above the largest
// multiple of RANGE that fits in a uint32.

const RANGE = 1_000_000; // 000000..999999

export function generateOtpCode(): string {
  const limit = Math.floor(0xffffffff / RANGE) * RANGE;
  const buf = new Uint32Array(1);
  let n: number;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= limit);
  return (n % RANGE).toString().padStart(6, "0");
}
