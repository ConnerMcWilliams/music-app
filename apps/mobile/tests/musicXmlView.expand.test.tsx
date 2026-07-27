import { act, render, userEvent } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';

import { MusicXmlView } from '@/components/practice';
import * as orientation from '@/lib/orientation';
import type { Exercise } from '@/types';

const exercise: Exercise = {
  id: 'clarke-1-1',
  number: 1,
  title: 'First Study',
  subtitle: 'Chromatic patterns · C major',
  key: 'C major',
  tempo: '♩ = 80',
  rangeLabel: 'G3–C5',
  category: 'Foundational',
  estMinutes: 5,
};

const ATTRS = `<attributes><divisions>4</divisions><clef><sign>G</sign><line>2</line></clef></attributes>`;
const BAR =
  '<note><pitch><step>G</step><octave>4</octave></pitch><duration>16</duration><type>whole</type></note>';

function xml(count: number): string {
  const measures = Array.from(
    { length: count },
    (_, i) => `<measure number="${i + 1}">${i === 0 ? ATTRS : ''}${BAR}</measure>`,
  ).join('');
  return `<score-partwise><part id="P1">${measures}</part></score-partwise>`;
}

/** RNTL v14 needs presses awaited inside act. */
const pressAsync = async (element: Parameters<typeof userEvent.press>[0]) => {
  await act(async () => {
    await userEvent.press(element);
  });
};

/**
 * `RootLayout` wraps the app in a `SafeAreaProvider`, and the fullscreen view
 * nests its own inside the modal. That provider renders nothing until it has
 * insets — seeded from its parent — so without a root there is no modal content
 * to find. There is no native module under Jest, hence the explicit metrics.
 */
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const renderCard = (ui: React.ReactElement) =>
  render(<SafeAreaProvider initialMetrics={METRICS}>{ui}</SafeAreaProvider>);

/**
 * The card's tap target is a `Pressable`, so its label replaces the header it
 * wraps — the study's identity has to be part of it or VoiceOver loses it.
 */
const EXPAND_LABEL = 'Expand music view, First Studies No. 1, C major';

describe('MusicXmlView tap to expand', () => {
  it('opens the fullscreen view when the notation is tapped', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);
    expect(view.queryByLabelText('Close expanded music view')).toBeNull();

    await pressAsync(view.getByLabelText(EXPAND_LABEL));
    expect(view.getByLabelText('Close expanded music view')).toBeTruthy();
  });

  it('closes again from the close button', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);

    await pressAsync(view.getByLabelText(EXPAND_LABEL));
    await pressAsync(view.getByLabelText('Close expanded music view'));
    expect(view.queryByLabelText('Close expanded music view')).toBeNull();
  });

  it('closes again from a tap outside the sheet', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);

    await pressAsync(view.getByLabelText(EXPAND_LABEL));
    await pressAsync(view.getByTestId('expanded-score-backdrop'));
    expect(view.queryByLabelText('Close expanded music view')).toBeNull();
  });

  it('flips the fullscreen pager without dismissing', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(10)} />);
    await pressAsync(view.getByLabelText(EXPAND_LABEL));

    // The card behind pages too; the fullscreen view renders after it.
    const nextButtons = view.getAllByText('Next ›');
    await pressAsync(nextButtons[nextButtons.length - 1]);

    expect(view.getByLabelText('Close expanded music view')).toBeTruthy();
    expect(view.getAllByText('Page 2 of 3')).toHaveLength(1);
  });

  it('shows the study heading while expanded', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);
    await pressAsync(view.getByLabelText(EXPAND_LABEL));

    // Both the card behind and the fullscreen header carry it.
    expect(view.getAllByText('FIRST STUDIES · No. 1')).toHaveLength(2);
  });

  it('flips the page without expanding when the pager is tapped', async () => {
    // 10 easy measures → 5 systems → 3 pages in the embedded card.
    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(10)} />);
    expect(view.getByText('Page 1 of 3')).toBeTruthy();

    await pressAsync(view.getByText('Next ›'));

    expect(view.getByText('Page 2 of 3')).toBeTruthy();
    expect(view.queryByLabelText('Close expanded music view')).toBeNull();
  });

  it('offers no press target when expandable is off', async () => {
    const view = await renderCard(
      <MusicXmlView exercise={exercise} musicXml={xml(2)} expandable={false} />,
    );
    expect(view.queryByLabelText(EXPAND_LABEL)).toBeNull();
  });

  it('does not make the unavailable state pressable', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} />);
    expect(view.getByText('Notation unavailable')).toBeTruthy();
    expect(view.queryByLabelText(EXPAND_LABEL)).toBeNull();
  });

  it('does not make the loading state pressable', async () => {
    const view = await renderCard(<MusicXmlView exercise={exercise} loading />);
    expect(view.getByText('Loading study…')).toBeTruthy();
    expect(view.queryByLabelText(EXPAND_LABEL)).toBeNull();
  });
});

describe('MusicXmlView fullscreen orientation', () => {
  it('allows rotation while expanded and restores portrait on close', async () => {
    const allow = jest.spyOn(orientation, 'allowRotation').mockResolvedValue();
    const lock = jest.spyOn(orientation, 'lockPortrait').mockResolvedValue();

    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);
    expect(allow).not.toHaveBeenCalled();

    await pressAsync(view.getByLabelText(EXPAND_LABEL));
    expect(allow).toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();

    await pressAsync(view.getByLabelText('Close expanded music view'));
    expect(lock).toHaveBeenCalled();
  });

  it('restores portrait if the view unmounts while still expanded', async () => {
    jest.spyOn(orientation, 'allowRotation').mockResolvedValue();
    const lock = jest.spyOn(orientation, 'lockPortrait').mockResolvedValue();

    const view = await renderCard(<MusicXmlView exercise={exercise} musicXml={xml(2)} />);
    await pressAsync(view.getByLabelText(EXPAND_LABEL));

    await act(async () => view.unmount());
    expect(lock).toHaveBeenCalled();
  });
});
