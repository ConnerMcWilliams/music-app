/**
 * The onboarding flow to render when the server's cannot be reached.
 *
 * Onboarding is a hard gate — an account that cannot finish it cannot use the
 * app — so the flow must never depend on a network round-trip. This is the
 * bundled fallback: the six steps exactly as they shipped, used whenever
 * `GET /api/onboarding/config/` fails, times out, or is throttled.
 *
 * It is a *fallback*, not a mirror. The server wins whenever it is reachable,
 * so drift between this file and the seeded `default` variant is self-correcting
 * and needs no cross-language test (unlike `instruments.ts`, whose data the
 * backend genuinely depends on and pins with one).
 *
 * Deliberately not re-exported from the `@/data` barrel: the step screens import
 * this module directly so none of them drags the bundled MusicXML catalog in
 * behind it, the same reason `onboardingChoices.ts` is imported by path.
 */
import type { OnboardingConfig } from '@/services/onboardingConfig';

/** Filter-only options — the client supplies the labels for these. */
function values(...list: (string | number)[]) {
  return list.map((value) => ({ value }));
}

export const DEFAULT_ONBOARDING_CONFIG: OnboardingConfig = {
  variantKey: 'bundled',
  experimentKey: null,
  armKey: null,
  steps: [
    {
      stepKey: 'name',
      copy: {
        title: 'What should we call you?',
        subtitle: "We'll use this to greet you when you sit down to practice.",
        cta: '',
        field_label: 'Your name',
        placeholder: 'Herbert',
      },
      options: {},
    },
    {
      stepKey: 'instrument',
      copy: {
        title: 'What do you play?',
        subtitle: "Clarke wrote these for cornet. We'll transpose them for your instrument.",
        cta: '',
      },
      options: {
        instruments: values(
          'trumpet',
          'cornet',
          'flugelhorn',
          'piccolo-trumpet',
          'french-horn',
          'mellophone',
          'alto-horn',
          'baritone-treble',
          'euphonium-treble',
          'trombone',
          'bass-trombone',
          'tuba',
        ),
      },
    },
    {
      stepKey: 'experience',
      copy: {
        title: 'How long have you been playing?',
        subtitle: 'This shapes how we pitch feedback — not how strictly we grade.',
        cta: '',
      },
      options: {
        levels: [
          { value: 'under_1', label: 'Less than a year', hint: 'Still building the basics.' },
          { value: 'y1_3', label: '1–3 years', hint: 'Comfortable with the fundamentals.' },
          {
            value: 'y3_7',
            label: '3–7 years',
            hint: 'Playing regularly, working on refinement.',
          },
          { value: 'over_7', label: '7+ years', hint: 'Experienced — here for the discipline.' },
        ],
      },
    },
    {
      stepKey: 'goal',
      copy: {
        title: 'What are you working toward?',
        subtitle: 'Pick the one that matters most right now. You can change it later.',
        cta: '',
      },
      options: {
        goals: [
          {
            value: 'tone',
            label: 'Better tone and control',
            hint: 'Steady, even sound at every dynamic.',
          },
          { value: 'range', label: 'Extend my range', hint: 'Reach higher without forcing.' },
          { value: 'endurance', label: 'Build endurance', hint: 'Last a full rehearsal or set.' },
          {
            value: 'technique',
            label: 'Faster, cleaner technique',
            hint: 'Fingers and tongue together.',
          },
          {
            value: 'consistency',
            label: 'Practice consistently',
            hint: 'Show up every day and keep a streak.',
          },
          {
            value: 'audition',
            label: 'Prepare for an audition',
            hint: 'Get sharp for a chair test or seat.',
          },
        ],
      },
    },
    {
      stepKey: 'practice',
      copy: {
        title: 'How often do you want to practice?',
        subtitle:
          "Your streak aims at this. Be honest rather than ambitious — it's easier to raise later.",
        cta: '',
        days_label: 'Days per week',
        reminder_label: 'Daily reminder',
        no_reminder_label: 'Not now',
        footnote:
          "We'll save your preference now — you'll be asked to allow notifications before any reminder is sent.",
      },
      options: {
        days: values(3, 4, 5, 6, 7),
        times: [
          { value: '07:00:00', label: '7:00 am' },
          { value: '08:00:00', label: '8:00 am' },
          { value: '12:00:00', label: 'Noon' },
          { value: '16:00:00', label: '4:00 pm' },
          { value: '18:00:00', label: '6:00 pm' },
          { value: '20:00:00', label: '8:00 pm' },
        ],
      },
    },
    {
      stepKey: 'clarke',
      copy: {
        title: 'Where are you with the Clarke studies?',
        subtitle: "We'll start you here. Everything before it stays open in the Studies tab.",
        cta: '',
        new_to_clarke_label: 'New to Clarke',
        new_to_clarke_hint: 'Start at the First Study.',
      },
      options: { sections: values(1, 2, 3, 4, 5, 6, 7, 8, 9, 10) },
    },
  ],
};
