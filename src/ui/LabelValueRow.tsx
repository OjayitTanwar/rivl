import React from "react";
import { useWindowDimensions } from "react-native";
import { Row, Stack, Txt } from "./primitives";
import { useTheme } from "./theme";

/** Keep long labels and values separate, including accessibility text sizes. */
export const LabelValueRow = React.memo(function LabelValueRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  const { fontScale, width } = useWindowDimensions(),
    { c } = useTheme();
  if (fontScale >= 1.3 || width < 320)
    return (
      <Stack gap={4}>
        <Txt>{label}</Txt>
        <Txt mono color={muted ? c.muted : c.text}>
          {value}
        </Txt>
      </Stack>
    );
  return (
    <Row between>
      <Txt style={{ flex: 1, minWidth: 0 }}>{label}</Txt>
      <Txt
        mono
        color={muted ? c.muted : c.text}
        style={{ maxWidth: "50%", flexShrink: 1, textAlign: "right" }}
      >
        {value}
      </Txt>
    </Row>
  );
});
