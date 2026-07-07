/**
 * Contract tests for the submission upload service.
 *
 * Jest-expo runs as `ios`, so these exercise the **native** upload path:
 * `submitTakeForGrading` uploads the recorded file by path with
 * expo-file-system's native multipart uploader (Expo's `fetch` polyfill can't
 * send a React Native `{uri,name,type}` FormData part — it throws "Unsupported
 * FormDataPart implementation"). They pin the endpoint, method, field name,
 * auth header, form parameters, the refresh-and-retry-on-401 behaviour, and how
 * backend failures map to typed errors. See docs/api.md.
 */
import { submitTakeForGrading, API_BASE_URL, type TakeUpload } from '@/services/api';
import { AuthError, tokenStore } from '@/services/auth';

import { __reset as resetSecureStore } from './mocks/expo-secure-store';
import {
  __reset as resetFileSystem,
  __setUploadResults,
  uploadCalls,
  lastFileUri,
  UploadType,
} from './mocks/expo-file-system';

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

function ok(body: unknown, status = 201) {
  return { status, body: JSON.stringify(body), headers: {} };
}

beforeEach(async () => {
  resetSecureStore();
  resetFileSystem();
  await tokenStore.save({ access: 'access-1', refresh: 'refresh-1' });
});

describe('submitTakeForGrading (native)', () => {
  it('uploads the file to /api/submissions/ with the bearer token and form fields', async () => {
    __setUploadResults(ok(WIRE_GRADE));

    const result = await submitTakeForGrading(TAKE);

    // The recorded file is uploaded by path.
    expect(lastFileUri).toBe(TAKE.uri);
    expect(uploadCalls).toHaveLength(1);
    const { url, options } = uploadCalls[0];
    expect(url).toBe(`${API_BASE_URL}/api/submissions/`);
    expect(options).toMatchObject({
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: 'audio/m4a',
      headers: { Authorization: 'Bearer access-1' },
      parameters: {
        exercise_id: 'clarke-2',
        exercise_title: 'Clarke Study No. 2',
        duration_seconds: '12.4',
      },
    });

    // Snake_case wire format is mapped to the app's camelCase GradingResult.
    expect(result).toMatchObject({
      submissionId: 'sub-1',
      exerciseId: 'clarke-2',
      totalScore: 84,
      gradeLabel: 'B',
    });
  });

  it('surfaces the backend rejection reason as an ApiError', async () => {
    __setUploadResults({
      status: 400,
      body: JSON.stringify({ audio: ['Audio file is too large (max 30 MB).'] }),
      headers: {},
    });

    await expect(submitTakeForGrading(TAKE)).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'Audio file is too large (max 30 MB).',
    });
  });

  it('refreshes once and retries when the access token has expired', async () => {
    // 1st upload → 401; token refresh happens via fetch; 2nd upload → 201.
    __setUploadResults(
      { status: 401, body: JSON.stringify({ detail: 'Token is invalid or expired' }), headers: {} },
      ok(WIRE_GRADE),
    );
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access: 'access-2', refresh: 'refresh-2' }),
    } as unknown as Response);

    const result = await submitTakeForGrading(TAKE);

    expect(result.submissionId).toBe('sub-1');
    expect(uploadCalls).toHaveLength(2);
    // The retry carries the freshly-minted token.
    expect(uploadCalls[1].options.headers).toEqual({ Authorization: 'Bearer access-2' });
  });

  it('raises an expired-session AuthError when the retry still 401s', async () => {
    __setUploadResults(
      { status: 401, body: '', headers: {} },
      { status: 401, body: '', headers: {} },
    );
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ access: 'access-2', refresh: 'refresh-2' }),
    } as unknown as Response);

    await expect(submitTakeForGrading(TAKE)).rejects.toBeInstanceOf(AuthError);
  });

  it('maps a native upload failure (unreadable file / no connection) to a NetworkError', async () => {
    // No queued result → the mock uploader throws, standing in for a transport
    // failure; it must surface as a retryable NetworkError, not a raw throw.
    await expect(submitTakeForGrading(TAKE)).rejects.toMatchObject({ name: 'NetworkError' });
  });
});
