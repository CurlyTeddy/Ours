# Crop images before upload

## Goal

Whenever a user picks an image to upload, they crop it in a dialog first. The cropped image is what gets uploaded. This applies at all four upload sites: the Moments photo gallery, the Profile avatar, Two-do create and Two-do edit.

## Requirements

- **R1 — Dialog opens on selection.** At every upload site, picking one or more non-GIF images opens the crop dialog. Nothing reaches the existing flow (upload, form field or preview) until every picked image has been applied or cancelled.
- **R2 — Two buttons only.** The dialog has exactly two actions: **Apply** and **Cancel**. There is no "use original" or skip button. Closing the dialog with Escape, the overlay or the close (X) button counts as Cancel for the current image.
- **R3 — One image at a time.** When several images are picked, the dialog shows them in the order they were picked, one at a time. With more than one image, the dialog description reads `Image {n} of {N}`. Pan and zoom reset to their defaults for each image. GIFs (R8) are not counted in `N`.
- **R4 — Cancel drops one image.** Cancel drops only the current image and moves on to the next one. When the queue ends, the site's existing flow receives the applied images in their original order. If every image was cancelled, the existing flow receives nothing: no upload, no form change and no success toast.
- **R5 — Aspect ratio per site.** The avatar crop is locked to 1:1 with a round crop shape. Moments, Two-do create and Two-do edit are locked to 4:3 with a rectangular crop shape.
- **R6 — Controls.** The user pans by dragging and zooms with a pinch gesture (touch) or the scroll wheel (desktop). Zoom ranges from 1 to 3 (default 1). There is no zoom slider or other on-screen zoom control (user decision), and no rotation.
- **R7 — Output file.** Apply produces a `File` that has:
  - the pixels of the selected area at the source's natural resolution, scaled down proportionally only when the area exceeds 16,777,216 pixels (the iOS Safari canvas limit; a 24 MP iPhone photo would otherwise fail);
  - the source's MIME type when it is `image/jpeg`, `image/png` or `image/webp` (JPEG and WebP at quality 0.92), and otherwise whatever type the browser's `canvas.toBlob` falls back to;
  - the source's filename, unchanged.
- **R8 — GIFs skip the dialog.** Files of type `image/gif` skip the dialog and pass through unchanged, keeping their place in the order.
- **R9 — Crop failure.** If an image can't be decoded or cropped, `toast.error("Failed to crop {filename}")` is shown and that image is treated as cancelled.
- **R10 — Validation stays where it is.** The existing count and size checks still run on the original files, before the dialog opens: the `FileUploader` dropzone `maxSize`/`maxFiles`, the Two-do edit checks for 5 images and 5 MB, and the Moments limit of 10. Files they reject never reach the dialog.
- **R11 — Picking the same file again.** After a selection is handled (applied or cancelled), picking the same file again through the hidden file input opens the dialog again. The input's `value` is reset after each change.
- **R12 — Apply button state.** Apply is disabled until the cropper has reported a crop area for the image currently shown (an area from the previous image never carries over), and while the cropped file is being produced.

## Inputs & validation

| Input               | Type                                                                                                   | Bounds                            | Error                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------- | ----------------------------------------------- |
| Picked files        | `File[]`                                                                                               | Each site's existing limits (R10) | Each site's existing toasts, unchanged          |
| Zoom                | number                                                                                                 | 1–3                               | none (cropper clamps)                           |
| Crop area           | `{ x, y, width, height }` in natural pixels, from `react-easy-crop`'s `onCropComplete` second argument | Inside the image                  | —                                               |
| Decode/crop failure | —                                                                                                      | —                                 | `toast.error("Failed to crop {filename}")` (R9) |

## Interfaces

### `lib/crop-image.ts`

- `export async function cropImage(file: File, area: Area): Promise<File>`, where `Area` is imported from `react-easy-crop`.
  - Loads `file` into an `HTMLImageElement` through an object URL, which it always revokes.
  - Draws `area` onto a canvas sized `area.width × area.height`.
  - Calls `canvas.toBlob(cb, file.type, 0.92)` and resolves `new File([blob], file.name, { type: blob.type })`.
  - Rejects if the image fails to load, `getContext("2d")` returns `null`, or `toBlob` yields `null`.

### `components/ui/image-crop-dialog.tsx`

- `export function ImageCropDialog(props: { files: File[]; aspect: number; cropShape?: "rect" | "round"; onComplete: (files: File[]) => void })`
  - The dialog is open whenever `files.length > 0`, and it starts a new queue whenever the `files` array identity changes. The unfinished queue is dropped without calling `onComplete`.
  - GIFs are passed through without being shown (R8).
  - Calls `onComplete` exactly once per queue, with the applied/pass-through files in their original order. The array may be empty. The caller must then set its `files` state to `[]`.
  - With a single image the description reads `Drag to reposition, pinch or scroll to zoom.`
  - If every picked file is a GIF, the dialog never opens and `onComplete(files)` is called straight away.
  - While Apply is producing the file, Cancel, Escape and the overlay are inert.
  - Uses the house `Dialog`. `DialogTitle` is `Crop image`. Buttons are named `Apply` and `Cancel`. There is no slider.

### `components/ui/file-uploader.tsx`

- `FileUploader` gets a new optional prop `cropAspect?: number`. When it is set, the files the dropzone accepts go through `ImageCropDialog` (with a rect shape) before they are added to the value and before `onUpload`. When it is unset, behaviour is unchanged.

### Call sites

- `features/moments/components/photo-gallery.tsx` (`PhotoGallery`): files picked go to `ImageCropDialog` with `aspect={4 / 3}`. `onComplete` runs the existing upload with the returned files and skips the upload when the array is empty.
- `features/profile/components/profile-card.tsx` (`AvatarManager`): the picked file goes to `ImageCropDialog` with `aspect={1}` and `cropShape="round"`. `onComplete` runs the existing preview and `field.onChange` logic with `files[0]`, and does nothing when the array is empty.
- `features/two-dos/components/create-button.tsx`: passes `cropAspect={4 / 3}` to `FileUploader`.
- `features/two-dos/components/edit-form.tsx` (`CarouselUploader`): runs the existing count and size checks, then sends the files to `ImageCropDialog` with `aspect={4 / 3}`. `onComplete` appends the returned files and shows the existing success toast, and does nothing when the array is empty.

No API routes or Zod schemas change.

## Data model changes

None.

## User flows

1. **Moments, single image**: Moments → Upload → pick one JPEG → the "Crop image" dialog opens with a 4:3 frame → pinch or scroll to zoom in and drag → Apply → "Photos uploaded successfully!" → the new photo shows in the carousel, and the uploaded object is 4:3.
2. **Moments, several images with one cancelled**: pick 3 images → the dialog reads "Image 1 of 3" → Apply → "Image 2 of 3" → Cancel → "Image 3 of 3" → Apply → exactly 2 photos are uploaded.
3. **Moments, all cancelled**: pick 1 image → Cancel (or Escape) → no request to `/api/moments/photos`, no toast. Pick the same file again → the dialog opens again.
4. **Profile avatar**: Profile → click the avatar → pick an image → the dialog shows a round 1:1 frame → Apply → the avatar preview shows the crop → Save → "Profile updated successfully!" → after a reload the avatar is the cropped image.
5. **Profile cancel**: pick an image → Cancel → the avatar preview and form are unchanged.
6. **Two-do create**: open the create dialog → drop 2 images on the uploader → crop each one (4:3) → both file cards appear → submit → the two-do is created with 2 images.
7. **Two-do edit**: edit a two-do → Upload → pick 1 image → Apply → "Image uploaded successfully!" → the image appears in the carousel → Save → the image persists.
8. **GIF passes through**: Two-do edit → pick a GIF → no dialog → the image is added as it was.

## Libraries

- **`react-easy-crop`**: a pan-and-zoom cropper under a fixed-aspect frame that works with touch, which fits ratios locked per site. It has the most yearly downloads of the crop libraries (92.8M against 78.9M for `react-image-crop`), had its last release on 2026-10-06, and the user chose it.

## Out of scope

- Re-cropping an image after it has been added to a Two-do form.
- Free (unlocked) aspect ratio, rotation and flip.
- Moving size validation to the cropped file.
- Downscaling or compressing beyond the crop itself.
- Animated GIF cropping.
