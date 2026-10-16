import React, { useRef, useState } from "react";
import { Linking, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Button, Stack, Txt } from "./primitives";
import { useTheme } from "./theme";

/** Scanning identifies a product only; saving still requires measured grams. */
export function NutritionBarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (barcode: string) => void;
  onClose: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState("");
  const once = useRef(false);
  const mounted = useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { c } = useTheme();
  return (
    <Stack gap={12}>
      {permission?.granted ? (
        <>
          {!error && (
            <View
              style={{
                height: 240,
                borderRadius: 16,
                overflow: "hidden",
                backgroundColor: c.nav,
              }}
            >
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{
                  barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "itf14"],
                }}
                onMountError={() =>
                  setError(
                    "Camera unavailable. Enter the barcode digits instead.",
                  )
                }
                onBarcodeScanned={({ data }) => {
                  if (once.current || !/^\d{8,14}$/.test(data)) return;
                  once.current = true;
                  onScan(data);
                }}
              />
            </View>
          )}
          <Txt size="caption" color={c.muted}>
            {error || "Point at the package barcode."}
          </Txt>
        </>
      ) : (
        <>
          <Txt color={c.muted}>
            Allow camera access to scan a package barcode.
          </Txt>
          <Button
            title={
              permission?.canAskAgain === false
                ? "Open camera settings"
                : "Allow camera"
            }
            variant="secondary"
            disabled={!permission}
            onPress={() => {
              if (permission?.canAskAgain === false) {
                void Linking.openSettings().catch(() => {
                  if (mounted.current)
                    setError(
                      "Open your phone settings to allow camera access.",
                    );
                });
                return;
              }
              void requestPermission().catch(() => {
                if (mounted.current)
                  setError(
                    "Camera permission unavailable. Enter the barcode digits instead.",
                  );
              });
            }}
          />
          {!!error && <Txt color={c.muted}>{error}</Txt>}
        </>
      )}
      <Button title="Enter digits instead" variant="quiet" onPress={onClose} />
    </Stack>
  );
}
