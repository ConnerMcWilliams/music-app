/**
 * A minimal in-place radix-2 complex FFT.
 *
 * Hand-rolled rather than pulled from npm: this is ~60 lines of well-understood
 * arithmetic, and the mobile Expo dependency graph is deliberately kept thin
 * (see the repo AGENTS notes). It exists only to serve `detect.ts` — the pitch
 * tracker needs a fast autocorrelation, and time-domain autocorrelation is
 * O(N²), far too slow at ~100 frames per second.
 *
 * Pure and platform-free, so it runs identically on device, on web, and in Jest.
 */

/** Smallest power of two >= `n` (minimum 1). */
export function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size <<= 1;
  return size;
}

/**
 * Twiddle-factor tables, cached per transform size.
 *
 * Computing `cos`/`sin` per butterfly is slow; deriving them by repeated complex
 * multiplication is fast but accumulates rounding error across the pass. A
 * precomputed table gives both, and analysis reuses one size for the whole
 * session so the cache is populated once.
 */
const twiddleCache = new Map<number, { cos: Float64Array; sin: Float64Array }>();

function twiddles(n: number): { cos: Float64Array; sin: Float64Array } {
  const cached = twiddleCache.get(n);
  if (cached) return cached;

  const half = n >> 1;
  const cos = new Float64Array(half);
  const sin = new Float64Array(half);
  for (let i = 0; i < half; i += 1) {
    const angle = (-2 * Math.PI * i) / n;
    cos[i] = Math.cos(angle);
    sin[i] = Math.sin(angle);
  }
  const table = { cos, sin };
  twiddleCache.set(n, table);
  return table;
}

/**
 * In-place FFT over parallel real/imaginary arrays.
 *
 * `re.length` must be a power of two and equal to `im.length`. The inverse
 * transform is scaled by `1/n`, matching NumPy's convention so results line up
 * with `backend/grading/engine/analysis.py`.
 */
export function fftInPlace(re: Float64Array, im: Float64Array, inverse = false): void {
  const n = re.length;
  if (n <= 1) return;
  if ((n & (n - 1)) !== 0) {
    throw new Error(`fftInPlace: length must be a power of two, got ${n}`);
  }

  // Decimation in time: reorder into bit-reversed index order.
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i];
      re[i] = re[j];
      re[j] = tr;
      const ti = im[i];
      im[i] = im[j];
      im[j] = ti;
    }
  }

  const { cos, sin } = twiddles(n);

  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const stride = n / len; // step into the full-size twiddle table
    for (let start = 0; start < n; start += len) {
      for (let k = 0; k < half; k += 1) {
        const tw = k * stride;
        // Conjugate the twiddle for the inverse transform.
        const wr = cos[tw];
        const wi = inverse ? -sin[tw] : sin[tw];

        const a = start + k;
        const b = a + half;
        const vr = re[b] * wr - im[b] * wi;
        const vi = re[b] * wi + im[b] * wr;

        re[b] = re[a] - vr;
        im[b] = im[a] - vi;
        re[a] += vr;
        im[a] += vi;
      }
    }
  }

  if (inverse) {
    for (let i = 0; i < n; i += 1) {
      re[i] /= n;
      im[i] /= n;
    }
  }
}

/**
 * Symmetric Hann window of length `m`, matching NumPy's `np.hanning`.
 *
 * Note this is the *symmetric* form (zero at both endpoints, denominator
 * `m - 1`), not the periodic form used for overlap-add synthesis. The backend
 * uses `np.hanning`, and the window shape affects the autocorrelation peak, so
 * the two must agree.
 */
export function hannWindow(m: number): Float64Array {
  const window = new Float64Array(m);
  if (m === 1) {
    window[0] = 1;
    return window;
  }
  for (let i = 0; i < m; i += 1) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1));
  }
  return window;
}
