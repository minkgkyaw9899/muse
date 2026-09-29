import { render } from '@testing-library/react-native';

import { HintRow } from '@/components/hint-row';

describe('HintRow', () => {
  it('shows the title and hint to the reader', async () => {
    const { getByText } = await render(
      <HintRow title="Publication imported" hint="Ready to read" />,
    );

    expect(getByText('Publication imported')).toBeTruthy();
    expect(getByText('Ready to read')).toBeTruthy();
  });
});
