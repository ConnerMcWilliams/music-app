/**
 * Contract tests for the submission upload service: the exact endpoint, method,
 * auth header, and multipart payload `submitTakeForGrading` sends, and how
 * backend failures map to typed errors. These pin the frontend half of the
 * `POST /api/submissions/` contract (see docs/api.md).
 */
import { API_BASE_URL, submitTakeForGrading, type TakeUpload } from '@/services/api';
import { tokenStore } from '@/services/auth';

import { __reset as resetSecureStore } from './mocks/expo-secure-store';

/** Minimal Response-like stub matching what the client reads (ok/status/text). */
function makeResp(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body == null ? '' : JSON.stringify(body)),
    json: async () => body,
  } as unknown as Response;
}

const WIRE_GRADE = {
  submission_id: 'sub-1',
  exercise_id: 'clarke-2',
  exercise_title: 'Clarke Study No. 2',
  total_score: 84,
  grade_label: 'B',
  categories: [{ label: 'Pitch Accuracy', score: 98 }],
  feedback_author: 'Prof. Halvorsen',
  feedback_initials: 'PH',
  feedback_text: 'Nice work.',
};

const TAKE: TakeUpload = {
  uri: 'file:///mock/take.m4a',
  mimeType: 'audio/m4a',
  exerciseId: 'clarke-2',
  exerciseTitle: 'Clarke Study No. 2',
  durationSeconds: 12.4,
};

/**
 * On device the global FormData is React Native's (file parts are plain
 * `{uri, name, type}` descriptors, readable via getParts()). Jest's node
 * environment ships whatwg FormData instead, which would stringify those
 * descriptors — so run this suite against RN's implementation.
 */
const RNFormData =
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native/Libraries/Network/FormData').default;
const nodeFormData = globalThis.FormData;
beforeAll(() => {
  globalThis.FormData = RNFormData;
});
afterAll(() => {
  globalThis.FormData = nodeFormData;
});

/** React Native FormData exposes its entries via getParts(). */
function partsOf(
  body: unknown,
): { fieldName: string; string?: string; uri?: string; name?: string }[] {
  return (body as { getParts(): never[] }).getParts();
}

beforeEach(async () => {
  resetSecureStore();
  await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
});

describe('submitTakeForGrading', () => {
  it('POSTs multipart form data to /api/submissions/ with the bearer token', async () => {
    const fetchMock = jest.fn().mockResolvedValue(makeResp(201, WIRE_GRADE));
    globalThis.fetch = fetchMock;

    const result = await submitTakeForGrading(TAKE);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/submissions/`);
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    // No explicit Content-Type: fetch must set the multipart boundary itself.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();

    const parts = partsOf(init.body);
    const byField = Object.fromEntries(parts.map((p) => [p.fieldName, p]));
    expect(byField.audio).toMatchObject({ uri: TAKE.uri, name: 'take.m4a', type: 'audio/m4a' });
    expect(byField.exercise_id).toMatchObject({ string: 'clarke-2' });
    expect(byField.exercise_title).toMatchObject({ string: 'Clarke Study No. 2' });
    expect(byField.duration_seconds).toMatchObject({ string: '12.4' });

    // Snake_case wire format is mapped to the app's camelCase GradingResult.
    expect(result).toMatchObject({
      submissionId: 'sub-1',
      exerciseId: 'clarke-2',
      totalScore: 84,
      gradeLabel: 'B',
    });
  });

  it('surfaces the backend rejection reason as an ApiError', async () => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(makeResp(400, { audio: ['Audio file is too large (max 30 MB).'] }));

    await expect(submitTakeForGrading(TAKE)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Audio file is too large (max 30 MB).',
    });
  });

  it('refreshes once and retries when the access token has expired', async () => {
    const fetchMock = jest
      .fn()
      // 1: submission → 401 (expired access token)
      .mockResolvedValueOnce(makeResp(401, { detail: 'Token is invalid or expired' }))
      // 2: refresh → new pair
      .mockResolvedValueOnce(makeResp(200, { access: 'access-2', refresh: 'refresh-2' }))
      // 3: retried submission → success
      .mockResolvedValueOnce(makeResp(201, WIRE_GRADE));
    globalThis.fetch = fetchMock;

    const result = await submitTakeForGrading(TAKE);

    expect(result.submissionId).toBe('sub-1');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const retryInit = fetchMock.mock.calls[2][1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer access-2');
  });
});
