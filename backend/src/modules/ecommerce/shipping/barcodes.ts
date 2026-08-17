import bwipjs from 'bwip-js';

type ToBuffer = (
  opts: Record<string, unknown>,
  cb: (err: Error | null | undefined, png?: Buffer) => void,
) => void;

function toPng(opts: Record<string, unknown>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const render = (bwipjs as unknown as { toBuffer: ToBuffer }).toBuffer;
    render(opts, (err, png) => {
      if (err || !png) reject(err ?? new Error('barcode render failed'));
      else resolve(png);
    });
  });
}

export async function renderCode128Png(text: string, scale = 2): Promise<Buffer> {
  return toPng({
    bcid: 'code128',
    text,
    scale,
    height: 12,
    includetext: false,
    backgroundcolor: 'FFFFFF',
    paddingwidth: 0,
    paddingheight: 0,
  });
}

export async function renderQrPng(text: string, scale = 3): Promise<Buffer> {
  return toPng({
    bcid: 'qrcode',
    text,
    scale,
    includetext: false,
    backgroundcolor: 'FFFFFF',
    paddingwidth: 2,
    paddingheight: 2,
  });
}

export function trackingScanPayload(input: {
  trackingNumber: string;
  carrier: string;
  orderIds: string[];
}): string {
  return JSON.stringify({
    v: 1,
    src: 'boommall',
    tn: input.trackingNumber,
    cr: input.carrier,
    oid: input.orderIds,
  });
}
