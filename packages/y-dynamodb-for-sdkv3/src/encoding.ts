import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

export const valueEncoding = {
  encode: (buf: Uint8Array) => Buffer.from(buf),
  decode: (buf: Iterable<number>) => Uint8Array.from(buf),
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
