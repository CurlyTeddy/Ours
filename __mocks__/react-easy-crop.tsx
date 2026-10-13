// Shared fake for react-easy-crop: jsdom can't decode images or lay out the real cropper.
// Tests read `cropper.props` to act as the cropper; set `cropper.autoReport = false`
// to report crop areas by hand.
import { useEffect } from "react";
import type { CropperProps } from "react-easy-crop";

export const cropper = {
  props: undefined as unknown as CropperProps,
  autoReport: true,
};

export default function Cropper(props: CropperProps) {
  cropper.props = props;
  // Like the real cropper, report an area once each image has loaded.
  useEffect(() => {
    if (!cropper.autoReport) return;
    props.onCropComplete?.(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 0, y: 0, width: 400, height: 300 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.image]);
  return null;
}
