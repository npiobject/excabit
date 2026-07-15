/**
 * Errores tipados de la capa de datos (docs/05 §4).
 *
 * BUG-003: el legacy encadenaba dos `.catch()` (el segundo nunca recibía nada
 * porque el primero ya había consumido el error) y el primero hacía
 * `alert(error)`: un fallo de red se convertía en un popup bloqueante lanzado
 * desde la capa de red. Aquí los errores son datos tipados que suben al
 * llamante; quien decide cómo mostrarlos es `ui/` (toast con reintento, RF-29).
 */

export type ApiErrorKind =
  /** Fallo de transporte: sin conexión, DNS, CORS, timeout. Reintentable. */
  | 'network'
  /** El recurso no existe (404). No reintentable: reintentar no lo creará. */
  | 'not-found'
  /** 429 o 503: el proveedor pide que bajemos el ritmo. Reintentable. */
  | 'rate-limited'
  /** La respuesta no tiene la forma esperada, o la entrada era inválida. */
  | 'invalid';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** Código HTTP, cuando lo hubo. */
  readonly status?: number;

  constructor(
    kind: ApiErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? {} : { cause: options.cause });
    this.name = 'ApiError';
    this.kind = kind;
    if (options.status !== undefined) this.status = options.status;
  }

  /** Solo se reintenta lo que puede cambiar de resultado por sí solo. */
  get isRetryable(): boolean {
    return this.kind === 'network' || this.kind === 'rate-limited';
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}
