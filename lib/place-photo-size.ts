// Preserve at least 70% of a portrait's height; landscape photos fill the frame.
export function placePhotoSize(
  boxWidth: number,
  boxHeight: number,
  imageWidth: number,
  imageHeight: number,
) {
  if (!imageWidth || !imageHeight || imageWidth >= imageHeight)
    return { width: boxWidth, height: boxHeight };
  const width = Math.min(
    boxWidth,
    (boxHeight * imageWidth) / imageHeight / 0.7,
  );
  return { width, height: (width * imageHeight) / imageWidth };
}
