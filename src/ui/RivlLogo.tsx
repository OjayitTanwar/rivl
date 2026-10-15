import React from "react";
import Svg, { Path, Rect } from "react-native-svg";
import { brand } from "./theme";
export function RivlLogo({
  size = 48,
  background = true,
  color = brand.ink,
}: {
  size?: number;
  background?: boolean;
  color?: string;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 1280 1280"
      accessibilityLabel="RIVL logo"
      accessibilityRole="image"
    >
      {background && (
        <Rect width="1280" height="1280" rx="262" fill={brand.coral} />
      )}
      <Path
        d="M332 249H376C471 379 604 373 777 405C940 435 1028 489 1028 579C1028 673 950 727 833 777C861 619 838 562 720 527C548 480 366 473 332 249ZM410 1022C230 983 170 903 224 762C278 625 443 570 599 552C690 541 762 577 675 615C504 688 318 761 391 979ZM728 656C594 670 533 724 550 796C573 881 713 930 1057 1084C1048 977 986 916 865 857C733 792 644 731 728 656Z"
        fill={color}
        fillRule="evenodd"
      />
    </Svg>
  );
}
