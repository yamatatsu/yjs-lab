/**
 * This file was written with reference to sindresorhus/crypto-random-string.
 * @see https://github.com/sindresorhus/crypto-random-string
 */

import { randomBytes } from "node:crypto";

const readUInt16LE = (uInt8Array: Uint8Array, offset: number) =>
  uInt8Array[offset] + (uInt8Array[offset + 1] << 8); // eslint-disable-line no-bitwise

const generateForCustomCharacters = (length: number, characters: string[]) => {
  // Generating entropy is faster than complex math operations, so we use the simplest way
  const characterCount = characters.length;
  const maxValidSelector =
    Math.floor(0x1_00_00 / characterCount) * characterCount - 1; // Using values above this will ruin distribution when using modular division
  const entropyLength = 2 * Math.ceil(1.1 * length); // Generating a bit more than required so chances we need more than one pass will be really low
  let string = "";
  let stringLength = 0;

  while (stringLength < length) {
    // In case we had many bad values, which may happen for character sets of size above 0x8000 but close to it
    const entropy = new Uint8Array(randomBytes(entropyLength));
    let entropyPosition = 0;

    while (entropyPosition < entropyLength && stringLength < length) {
      const entropyValue = readUInt16LE(entropy, entropyPosition);
      entropyPosition += 2;
      if (entropyValue > maxValidSelector) {
        // Skip values which will ruin distribution when using modular division
        continue;
      }

      string += characters[entropyValue % characterCount];
      stringLength++;
    }
  }

  return string;
};

const alphanumericCharacters = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789",
];
export const uniq = (length: number = 32) => {
  return generateForCustomCharacters(length, alphanumericCharacters);
};
