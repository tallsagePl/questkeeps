'use client';

import { useLocale } from './appearance';
import { FeedbackButton } from './feedback';

export type MediaVisibilityChange = {
  hidden?: boolean;
  hiddenFromGuests?: boolean;
};

export default function MediaVisibilityControls({
  hidden,
  hiddenFromGuests = false,
  disabled,
  onChange,
  feedback = false,
}: {
  hidden: boolean | number;
  hiddenFromGuests?: boolean | number;
  disabled: boolean;
  feedback?: boolean;
  onChange: (change: MediaVisibilityChange) => void | Promise<void>;
}) {
  const { t } = useLocale();
  const Button = feedback ? FeedbackButton : 'button';
  return (
    <>
      <Button
        type="button"
        className="text-button"
        disabled={disabled}
        onClick={() => onChange({ hidden: !hidden })}
      >
        {t(
          hidden
            ? hiddenFromGuests
              ? 'visibility.showParticipants'
              : 'visibility.showEveryone'
            : 'visibility.hideEveryone',
        )}
      </Button>
      <Button
        type="button"
        className="text-button"
        disabled={disabled || !!hidden}
        onClick={() => onChange({ hiddenFromGuests: !hiddenFromGuests })}
      >
        {t(
          hiddenFromGuests ? 'visibility.showGuests' : 'visibility.hideGuests',
        )}
      </Button>
    </>
  );
}
