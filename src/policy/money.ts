import { AppError } from '../common/errors';

export class InvalidMoneyError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, 'INVALID_MONEY_VALUE', details);
  }
}

/**
 * Validates and converts a money value (number or string) into exact integer cents (BigInt).
 * Prevents floating-point rounding errors and rejects invalid representations.
 *
 * Rules:
 * - Must be a positive finite number or numeric string.
 * - Cannot exceed 2 decimal places (fractions of a cent like 10.505 are rejected).
 * - Zero, negative numbers, NaN, and Infinity are strictly rejected.
 */
export function parseMoneyToCents(value: number | string | unknown): bigint {
  if (value === null || value === undefined) {
    throw new InvalidMoneyError('Money value is required and cannot be null or undefined.');
  }

  let strValue: string;

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Number.isNaN(value)) {
      throw new InvalidMoneyError('Money value must be a finite number.');
    }
    if (value <= 0) {
      throw new InvalidMoneyError('Money value must be greater than zero.');
    }
    // Check if number has more than 2 decimal digits
    const parts = value.toString().split('.');
    if (parts[1] && parts[1].length > 2) {
      throw new InvalidMoneyError(
        `Money value has invalid decimal precision (${parts[1].length} decimal places). Maximum 2 decimal places allowed.`
      );
    }
    strValue = value.toFixed(2);
  } else if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new InvalidMoneyError('Money value string cannot be empty.');
    }

    // Strict regex: positive integer or decimal with up to 2 decimal places
    const validMoneyRegex = /^[0-9]+(\.[0-9]{1,2})?$/;
    if (!validMoneyRegex.test(trimmed)) {
      throw new InvalidMoneyError(
        `Money value "${trimmed}" is not a valid decimal representation. Must be formatted like "10" or "10.50".`
      );
    }

    strValue = trimmed;
  } else {
    throw new InvalidMoneyError('Money value must be a number or a string.');
  }

  const [wholePart, fracPart = ''] = strValue.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);

  const cents = BigInt(wholePart!) * 100n + BigInt(paddedFrac);

  if (cents <= 0n) {
    throw new InvalidMoneyError('Money value must be strictly positive (greater than 0 cents).');
  }

  return cents;
}

/**
 * Format exact cents into a standard 2-decimal string (e.g. 1050n -> "10.50")
 */
export function formatCents(cents: bigint | number): string {
  const c = typeof cents === 'bigint' ? cents : BigInt(cents);
  const isNegative = c < 0n;
  const absCents = isNegative ? -c : c;

  const dollars = absCents / 100n;
  const remainder = absCents % 100n;
  const paddedFrac = remainder.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${dollars}.${paddedFrac}`;
}

/**
 * Convert exact cents to a standard JavaScript float for external API payload serialization
 */
export function centsToNumber(cents: bigint | number): number {
  return parseFloat(formatCents(cents));
}
