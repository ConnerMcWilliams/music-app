/**
 * Real API layer for the Django backend.
 *
 * Today this covers submitting a take for grading; the study catalog still reads
 * from the mocks in `src/data` (see the TODO(api) notes there). The current
 * user's streak/stats live in `src/services/profile.ts`.
 */
import Constants from 'expo-constants';
import { File, UploadType } from 'expo-file-system';
import { Platform } from 'react-native';

import { ApiError } from '@/services/apiError';
// NOTE: `authClient` imports `API_BASE_URL` from this module, forming an import
// cycle. It is safe because both sides use the imported binding only at call
// time (never during module initialization), so neither reads an undefined value.
import { authClient, AuthError, NetworkError, parseErrorBody } from '@/services/auth';
import type { GradingResult } from '@/types';

/**
 * Resolve the backend origin:
 * 1. `EXPO_PUBLIC_API_URL` when set (production / explicit override).
 * 2. The Metro dev-server host with the Django dev port — on a device or
 *    emulator, "localhost" is the phone itself, but the machine serving the
 *    JS bundle is also the one running `manage.py runserver`.
 * 3. Plain localhost (web / last resort).
 */
function resolveApiBaseUrl(): string {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri;
  const host = hostUri ? hostUri.split(':')[0] : 'localhost';
  return `http://${normalizeDevHost(host)}:8000`;
}

/**
 * The Android emulator can't reach the host machine via localhost/127.0.0.1 —
 * those resolve to the emulator itself. Google's emulator exposes the host at
 * the special alias 10.0.2.2, so remap loopback hosts on Android. (A physical
 * device already gets the machine's LAN IP from `hostUri`, so it's untouched.)
 */
function normalizeDevHost(host: string): string {
  if (Platform.OS === 'android' && (host === 'localhost' || host === '127.0.0.1')) {
    return '10.0.2.2';
  }
  return host;
}

export const API_BASE_URL = resolveApiBaseUrl();

if (__DEV__) {
  // One line that answers "what URL is the app actually calling?" — the first
  // question whenever the backend seems unreachable (docs/troubleshooting.md).
  console.log(`[api] base URL: ${API_BASE_URL}`);
}

/** An audio take to grade — either a fresh recording or a picked file. */
export interface TakeUpload {
  /** Local file URI (recorder output or document-picker copy). */
  uri: string;
  /** MIME type when known, e.g. "audio/m4a". */
  mimeType?: string;
  /** Original filename when the take was picked from the file system. */
  fileName?: string;
  exerciseId: string;
  exerciseTitle: string;
  durationSeconds?: number;
}

/** Shape of the backend's grading response (snake_case wire format). */
interface SubmissionResponse {
  submission_id: string;
  exercise_id: string;
  exercise_title: string;
  total_score: number;
  grade_label: string;
  categories: { label: string; score: number }[];
  feedback_author: string;
  feedback_initials: string;
  feedback_text: string;
  xp_awarded: number;
  coins_awarded: number;
  level: number;
  rank_title: string;
  leveled_up: boolean;
}

/**
 * POST the take to `/api/submissions/` and return the grade.
 *
 * Submitting a take is authenticated (it advances the caller's streak). The
 * transport differs by platform (see `postSubmissionNative`/`postSubmissionWeb`)
 * because Expo's `fetch` polyfill can't send a React Native file part; both
 * paths return a raw `{status, body}` that this function maps to a
 * `GradingResult` or a typed error (`AuthError` on 401, `ApiError` otherwise).
 */
export async function submitTakeForGrading(take: TakeUpload): Promise<GradingResult> {
  const fields = {
    exercise_id: take.exerciseId,
    exercise_title: take.exerciseTitle,
    duration_seconds: String(take.durationSeconds ?? 0),
  };

  const { status, body } =
    Platform.OS === 'web'
      ? await postSubmissionWeb(take, fields)
      : await postSubmissionNative(take, fields);

  if (status < 200 || status >= 300) {
    // Surface the backend's own explanation (serializer/permission/throttle
    // detail) so the screen can show why the take was rejected.
    const detail = parseBodyMessage(body);
    if (__DEV__) {
      console.warn(`[api] POST /api/submissions/ → HTTP ${status}`, detail ?? '(no body)');
    }
    if (status === 401) {
      throw new AuthError('Your session has expired. Please sign in again.', {
        status,
        sessionInvalid: true,
      });
    }
    throw new ApiError(detail ?? `Grading request failed (HTTP ${status}).`, status);
  }

  const parsed = JSON.parse(body) as SubmissionResponse;
  return {
    submissionId: parsed.submission_id,
    exerciseId: parsed.exercise_id,
    exerciseTitle: parsed.exercise_title,
    totalScore: parsed.total_score,
    gradeLabel: parsed.grade_label,
    categories: parsed.categories,
    feedbackAuthor: parsed.feedback_author,
    feedbackInitials: parsed.feedback_initials,
    feedbackText: parsed.feedback_text,
    xpAwarded: parsed.xp_awarded,
    coinsAwarded: parsed.coins_awarded,
    level: parsed.level,
    rankTitle: parsed.rank_title,
    leveledUp: parsed.leveled_up,
  };
}

/** A backend response reduced to the two things the caller needs. */
interface RawResponse {
  status: number;
  body: string;
}

/**
 * Native upload path. Expo's global `fetch` polyfill can't send React Native's
 * `{ uri, name, type }` FormData file part ("Unsupported FormDataPart
 * implementation"), so on iOS/Android we upload the file by path with
 * expo-file-system's native multipart uploader instead. It also sidesteps the
 * RN Android AbortSignal-on-upload failure. Auth isn't handled by `fetch` here,
 * so we attach the token ourselves and refresh-and-retry once on a 401 — the
 * same contract `authedRequest` gives the JSON endpoints.
 */
async function postSubmissionNative(
  take: TakeUpload,
  fields: Record<string, string>,
): Promise<RawResponse> {
  const file = new File(take.uri);
  const url = `${API_BASE_URL}/api/submissions/`;
  const upload = (token: string) =>
    file.upload(url, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'audio',
      mimeType: take.mimeType ?? 'audio/m4a',
      parameters: fields,
      headers: { Authorization: `Bearer ${token}` },
    });

  try {
    let token = await authClient.getAccessToken();
    let result = await upload(token);
    if (result.status === 401) {
      // Access token likely expired — rotate once and retry (mirrors authedFetch).
      token = await authClient.getAccessToken({ forceRefresh: true });
      result = await upload(token);
    }
    return { status: result.status, body: result.body };
  } catch (err) {
    // A definitively invalid session bubbles up as AuthError; everything else
    // from the native uploader (file unreadable, connection failed) is a
    // transport failure the user can retry.
    if (err instanceof AuthError) throw err;
    throw new NetworkError();
  }
}

/**
 * Web upload path. On web the recorder/picker URI is a `blob:` URL and the
 * standard `fetch`/`FormData`/`Blob` stack works, so keep going through
 * `authedRequest` (bearer + refresh-retry).
 */
async function postSubmissionWeb(
  take: TakeUpload,
  fields: Record<string, string>,
): Promise<RawResponse> {
  const form = new FormData();
  const name = take.fileName ?? `take.${extensionFor(take.mimeType)}`;
  const blob = await (await fetch(take.uri)).blob();
  form.append('audio', blob, name);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }
  const resp = await authClient.authedRequest('/api/submissions/', {
    method: 'POST',
    body: form,
  });
  return { status: resp.status, body: await resp.text() };
}

/** Best-effort DRF error message from a (possibly non-JSON) response body. */
function parseBodyMessage(body: string): string | undefined {
  if (!body) return undefined;
  try {
    return parseErrorBody(JSON.parse(body)).message;
  } catch {
    return undefined; // non-JSON body (e.g. an HTML 500) — no safe message
  }
}

function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return 'm4a';
  const subtype = mimeType.split('/')[1] ?? 'm4a';
  // "audio/mp4" and "audio/x-m4a" are what iOS/Android recorders emit.
  return subtype === 'mp4' || subtype === 'x-m4a' ? 'm4a' : subtype;
}
