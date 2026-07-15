import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateLimiter } from '@/data/rate-limiter';
import { ApiError } from '@/data/errors';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('RNF-04 — límite de peticiones por segundo', () => {
  it('deja pasar hasta N peticiones por segundo sin esperar', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 4 });
    const task = vi.fn(() => Promise.resolve('ok'));

    const inFlight = Promise.all([
      limiter.schedule(task),
      limiter.schedule(task),
      limiter.schedule(task),
      limiter.schedule(task),
    ]);

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(4);
    await expect(inFlight).resolves.toEqual(['ok', 'ok', 'ok', 'ok']);
  });

  it('encola el exceso: la 5ª petición espera al siguiente hueco', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 4 });
    const task = vi.fn(() => Promise.resolve('ok'));

    const inFlight = Promise.all(Array.from({ length: 5 }, () => limiter.schedule(task)));

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(4);

    // El hueco se abre 250 ms después (1000/4).
    await vi.advanceTimersByTimeAsync(250);
    expect(task).toHaveBeenCalledTimes(5);

    await expect(inFlight).resolves.toHaveLength(5);
  });

  it('respeta el orden FIFO de la cola', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 1 });
    const order: number[] = [];
    const task = (id: number) => () => {
      order.push(id);
      return Promise.resolve(id);
    };

    const inFlight = Promise.all([
      limiter.schedule(task(1)),
      limiter.schedule(task(2)),
      limiter.schedule(task(3)),
    ]);

    await vi.advanceTimersByTimeAsync(3000);

    expect(order).toEqual([1, 2, 3]);
    await expect(inFlight).resolves.toEqual([1, 2, 3]);
  });

  it('la cola se vacía al recuperarse: nada queda colgado', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 2 });
    const task = vi.fn(() => Promise.resolve('ok'));

    const inFlight = Promise.all(Array.from({ length: 10 }, () => limiter.schedule(task)));

    await vi.advanceTimersByTimeAsync(10_000);

    await expect(inFlight).resolves.toHaveLength(10);
    expect(task).toHaveBeenCalledTimes(10);
    expect(limiter.pending).toBe(0);
  });
});

describe('RNF-04 — backoff exponencial tras 429', () => {
  it('reintenta un 429 con backoff exponencial', async () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 100,
      baseDelayMs: 500,
      random: () => 0, // jitter neutralizado para poder medir
    });
    const task = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('rate-limited', '429'))
      .mockRejectedValueOnce(new ApiError('rate-limited', '429'))
      .mockResolvedValueOnce('ok');

    const inFlight = limiter.schedule(task);

    await vi.advanceTimersByTimeAsync(0);
    expect(task).toHaveBeenCalledTimes(1);

    // 1er backoff: 500 ms.
    await vi.advanceTimersByTimeAsync(500);
    expect(task).toHaveBeenCalledTimes(2);

    // 2º backoff: 1000 ms (exponencial).
    await vi.advanceTimersByTimeAsync(999);
    expect(task).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(task).toHaveBeenCalledTimes(3);

    await expect(inFlight).resolves.toBe('ok');
  });

  it('aplica jitter al backoff (dos esperas no son idénticas)', async () => {
    const delays: number[] = [];
    const limiter = new RateLimiter({
      requestsPerSecond: 100,
      baseDelayMs: 1000,
      random: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(1),
      onBackoff: (ms) => delays.push(ms),
    });
    const task = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('rate-limited', '429'))
      .mockRejectedValueOnce(new ApiError('rate-limited', '429'))
      .mockResolvedValueOnce('ok');

    const inFlight = limiter.schedule(task);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(inFlight).resolves.toBe('ok');

    expect(delays).toHaveLength(2);
    // random=0 → sin jitter; random=1 → jitter máximo. Nunca coinciden.
    expect(delays[0]).not.toBe(delays[1]);
    expect(delays[0]).toBeGreaterThanOrEqual(1000);
    expect(delays[1]).toBeGreaterThan(2000);
  });

  it('reintenta también los fallos de red', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, baseDelayMs: 10, random: () => 0 });
    const task = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('network', 'sin conexión'))
      .mockResolvedValueOnce('ok');

    const inFlight = limiter.schedule(task);
    await vi.advanceTimersByTimeAsync(1000);

    await expect(inFlight).resolves.toBe('ok');
    expect(task).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta un 404: reintentar no va a crear el recurso', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, baseDelayMs: 10 });
    const task = vi.fn().mockRejectedValue(new ApiError('not-found', 'no existe'));

    // El handler se adjunta ANTES de avanzar el reloj: si no, la promesa se
    // rechaza sin nadie escuchando y Node lo reporta como unhandled rejection.
    const assertion = expect(limiter.schedule(task)).rejects.toMatchObject({ kind: 'not-found' });
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('se rinde tras 3 reintentos y propaga el último error', async () => {
    const limiter = new RateLimiter({
      requestsPerSecond: 100,
      maxRetries: 3,
      baseDelayMs: 10,
      random: () => 0,
    });
    const task = vi.fn().mockRejectedValue(new ApiError('rate-limited', '429 siempre'));

    const assertion = expect(limiter.schedule(task)).rejects.toMatchObject({
      kind: 'rate-limited',
    });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;

    // 1 intento inicial + 3 reintentos.
    expect(task).toHaveBeenCalledTimes(4);
  });

  it('un error no-ApiError se propaga sin reintentar (no lo sabemos interpretar)', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, baseDelayMs: 10 });
    const task = vi.fn().mockRejectedValue(new TypeError('bug de programación'));

    const assertion = expect(limiter.schedule(task)).rejects.toThrow(TypeError);
    await vi.advanceTimersByTimeAsync(5000);
    await assertion;

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('un fallo en una tarea no bloquea la cola', async () => {
    const limiter = new RateLimiter({ requestsPerSecond: 100, baseDelayMs: 10 });
    const bad = vi.fn().mockRejectedValue(new ApiError('not-found', 'no existe'));
    const good = vi.fn().mockResolvedValue('ok');

    const failed = limiter.schedule(bad).catch((e: unknown) => e);
    const succeeded = limiter.schedule(good);

    await vi.advanceTimersByTimeAsync(1000);

    await expect(failed).resolves.toBeInstanceOf(ApiError);
    await expect(succeeded).resolves.toBe('ok');
    expect(limiter.pending).toBe(0);
  });
});
