import { type Result, err, ok } from "neverthrow";

import type { Crop } from "../params/crop";
import { Gravity } from "../params/gravity";
import { anchor } from "./anchor";
import type { GeometryError } from "./geometry-error";
import { Rect } from "./rect";
import type { Size } from "./size";

export const CropArea = {
  /** Crop region from ic/oc. Reversed coordinates are normalized and parts outside the image are clipped. */
  resolve: (size: Size, crop: Crop, g: Gravity): Result<Rect, GeometryError> => {
    const toPx = (v: number, total: number) => (crop.kind === "Ratio" ? Math.round(v * total) : v);
    const x1 = toPx(Math.min(crop.x1, crop.x2), size.width);
    const x2 = toPx(Math.max(crop.x1, crop.x2), size.width);
    const y1 = toPx(Math.min(crop.y1, crop.y2), size.height);
    const y2 = toPx(Math.max(crop.y1, crop.y2), size.height);
    const [fx, fy] = Gravity.factor(g);
    const rect = Rect.clip(
      {
        left: anchor(size.width, x2 - x1, x1, fx),
        top: anchor(size.height, y2 - y1, y1, fy),
        width: x2 - x1,
        height: y2 - y1,
      },
      size,
    );
    return rect ? ok(rect) : err({ kind: "ClipOutOfImage" });
  },
} as const;
