/**
 * Keeps user-visible refresh feedback on screen long enough to be perceived,
 * while still waiting for the real network operation to finish.
 */
export async function withMinimumDuration<T>(task: Promise<T>, minimumMs = 900): Promise<T> {
  const [result] = await Promise.allSettled([
    task,
    new Promise<void>((resolve) => setTimeout(resolve, minimumMs)),
  ]);
  if (result.status === 'rejected') throw result.reason;
  return result.value;
}
