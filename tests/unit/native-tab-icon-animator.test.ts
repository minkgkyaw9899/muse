import { createNativeTabIconAnimator } from '@/components/native-tab-icon-animator';

it('bounces a changed tab without animating the initial selection or a repeated focus', async () => {
  const selections: number[] = [];
  const animator = createNativeTabIconAnimator(async (index) => {
    selections.push(index);
    return 'animated';
  });

  expect(await animator.select(0)).toBe('initial');
  expect(await animator.select(1)).toBe('animated');
  expect(await animator.select(1)).toBe('unchanged');
  expect(await animator.select(2)).toBe('animated');
  expect(selections).toEqual([1, 2]);
});

it('keeps navigation usable when the native build cannot perform the effect', async () => {
  const animator = createNativeTabIconAnimator(async () => {
    throw new Error('Native module unavailable');
  });
  await animator.select(0);
  expect(await animator.select(1)).toBe('unavailable');
  expect(await animator.select(1)).toBe('unchanged');
});

it('reports a reduced-motion skip and permits a later selection', async () => {
  let reduceMotion = true;
  const animator = createNativeTabIconAnimator(async () =>
    reduceMotion ? 'reduceMotion' : 'animated',
  );
  await animator.select(0);
  expect(await animator.select(1)).toBe('reduceMotion');
  reduceMotion = false;
  expect(await animator.select(2)).toBe('animated');
});

it('bounces the previous primary tab after visiting the native Search tab', async () => {
  const selections: number[] = [];
  const animator = createNativeTabIconAnimator(async (index) => {
    selections.push(index);
    return index === 3 ? 'unavailable' : 'animated';
  });

  await animator.select(0);
  expect(await animator.select(3)).toBe('unavailable');
  expect(await animator.select(0)).toBe('animated');
  expect(selections).toEqual([3, 0]);
});
