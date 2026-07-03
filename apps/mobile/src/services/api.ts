/**
 * Real API layer for the Django backend.
 *
 * Today this covers only submitting a take for grading; the study catalog and
 * profile screens still read from the mocks in `src/data` (see the TODO(api)
 * notes there).
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';

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
  if (hostUri) {
    const host = hostUri.split(':')[0];
    return `http://${host}:8000`;
  }

  return 'http://localhost:8000';
}

export const API_BASE_URL = resolveApiBaseUrl();

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
}

/**
 * POST the take to `/api/submissions/` and return the grade.
 *
 * The backend currently returns a placeholder grade; the response shape is the
 * real contract, so nothing here changes when the grading engine lands.
 */
export async function submitTakeForGrading(take: TakeUpload): Promise<GradingResult> {
  const form = new FormData();
  const name = take.fileName ?? `take.${extensionFor(take.mimeType)}`;

  if (Platform.OS === 'web') {
    // On web the recorder/picker URI is a blob: URL — send the blob itself.
    const blob = await (await fetch(take.uri)).blob();
    form.append('audio', blob, name);
  } else {
    // React Native's FormData takes a file descriptor object, not a Blob.
    form.append('audio', {
      uri: take.uri,
      name,
      type: take.mimeType ?? 'audio/m4a',
    } as unknown as Blob);
  }

  form.append('exercise_id', take.exerciseId);
  form.append('exercise_title', take.exerciseTitle);
  if (take.durationSeconds != null) {
    form.append('duration_seconds', String(take.durationSeconds));
  }

  const resp = await fetch(`${API_BASE_URL}/api/submissions/`, {
    method: 'POST',
    body: form,
  });
  if (!resp.ok) {
    throw new Error(`Grading request failed (HTTP ${resp.status}).`);
  }

  const body: SubmissionResponse = await resp.json();
  return {
    submissionId: body.submission_id,
    exerciseId: body.exercise_id,
    exerciseTitle: body.exercise_title,
    totalScore: body.total_score,
    gradeLabel: body.grade_label,
    categories: body.categories,
    feedbackAuthor: body.feedback_author,
    feedbackInitials: body.feedback_initials,
    feedbackText: body.feedback_text,
  };
}

function extensionFor(mimeType: string | undefined): string {
  if (!mimeType) return 'm4a';
  const subtype = mimeType.split('/')[1] ?? 'm4a';
  // "audio/mp4" and "audio/x-m4a" are what iOS/Android recorders emit.
  return subtype === 'mp4' || subtype === 'x-m4a' ? 'm4a' : subtype;
}
