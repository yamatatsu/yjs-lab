import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as binary from "lib0/binary";
import { DocumentKey } from "./types";

const writeUint32BigEndian = (encoder: encoding.Encoder, num: number) => {
  for (let i = 3; i >= 0; i--) {
    encoding.write(encoder, (num >>> (8 * i)) & binary.BITS8);
  }
};

const readUint32BigEndian = (decoder: decoding.Decoder) => {
  const uint =
    (decoder.arr[decoder.pos + 3] +
      (decoder.arr[decoder.pos + 2] << 8) +
      (decoder.arr[decoder.pos + 1] << 16) +
      (decoder.arr[decoder.pos] << 24)) >>>
    0;
  decoder.pos += 4;
  return uint;
};
const YEncodingString = 0;
const YEncodingUint32 = 1;

export const valueEncoding = {
  encode: (buf: Uint8Array) => Buffer.from(buf),
  decode: (buf: Iterable<number>) => Uint8Array.from(buf),
};

export const keyEncoding = {
  encode: (arr: DocumentKey) => {
    const encoder = encoding.createEncoder();
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (typeof v === "string") {
        encoding.writeUint8(encoder, YEncodingString);
        encoding.writeVarString(encoder, v);
      } /* istanbul ignore else */ else if (typeof v === "number") {
        encoding.writeUint8(encoder, YEncodingUint32);
        writeUint32BigEndian(encoder, v);
      } else {
        throw new Error("Unexpected key value");
      }
    }
    return Buffer.from(encoding.toUint8Array(encoder));
  },
  decode: (buf: Uint8Array): DocumentKey => {
    const decoder = decoding.createDecoder(buf);
    const key = [];
    while (decoding.hasContent(decoder)) {
      switch (decoding.readUint8(decoder)) {
        case YEncodingString:
          key.push(decoding.readVarString(decoder));
          break;
        case YEncodingUint32:
          key.push(readUint32BigEndian(decoder));
          break;
      }
    }
    return key as DocumentKey;
  },
};

type StateVectorSource = {
  /** state vector */
  sv: Uint8Array;
  /** current clock of the document so we can determine when this statevector was created */
  clock: number;
};
export const stateVectorEncoding = {
  encode: ({ sv, clock }: StateVectorSource): Uint8Array => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, clock);
    encoding.writeVarUint8Array(encoder, sv);
    return encoding.toUint8Array(encoder);
  },
  decode: (buf: Uint8Array): StateVectorSource => {
    const decoder = decoding.createDecoder(buf);
    const clock = decoding.readVarUint(decoder);
    const sv = decoding.readVarUint8Array(decoder);
    return { sv, clock };
  },
};
