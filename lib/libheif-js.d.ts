// libheif-js ships no types for its browser bundle; this covers the part decode-image.ts uses.
declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    is_primary(): boolean;
    display(
      target: ImageData,
      callback: (result: ImageData | null) => void,
    ): void;
    free(): void;
  }

  interface Libheif {
    HeifDecoder: new () => { decode(data: Uint8Array): HeifImage[] };
  }

  export default function createLibheif(): Libheif;
}
