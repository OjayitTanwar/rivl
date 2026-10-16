import React, { useEffect, useState } from "react";
import { AppState } from "react-native";
import type { Device } from "react-native-ble-plx";
import { useStore } from "../src/state/store";
import {
  Screen,
  Stack,
  ListRow,
  Txt,
  Button,
  Notice,
  Row,
  SectionHeading,
  Empty,
} from "../src/ui/primitives";
import { useTheme } from "../src/ui/theme";
import {
  connectedSensors,
  subscribeSensors,
  scanSensors,
  stopSensorScan,
  connectSensor,
  disconnectSensor,
} from "../src/services/sensors";
import { userMessage } from "../src/security/errors";
import { LoadingJourney } from "../src/ui/LoadingJourney";
import { Watch } from "lucide-react-native";
import { router } from "expo-router";
export default function Devices() {
  const { profile } = useStore(),
    { c } = useTheme();
  const [, refresh] = useState(0),
    [devices, setDevices] = useState<Device[]>([]),
    [scanning, setScanning] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const unsubscribe = subscribeSensors(() => refresh((n) => n + 1));
    const state = AppState.addEventListener("change", (s) => {
      if (s !== "active") {
        stopSensorScan();
        setScanning(false);
      }
    });
    return () => {
      unsubscribe();
      state.remove();
      stopSensorScan();
    };
  }, []);
  const connected = connectedSensors(profile?.id ?? "");
  async function act(id: string, task: () => Promise<void>) {
    setBusy(id);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy("");
    }
  }
  return (
    <Screen title="Devices & sensors" back>
      <Stack gap={8}>
        <SectionHeading title="Bring your measurements along" />
        <Txt color={c.muted}>Connect your watch or a nearby Bluetooth sensor to record heart rate and cycling power.</Txt>
      </Stack>
      {!!error && <Notice text={error} />}
      <ListRow
        title="Apple Watch"
        detail="Watch recordings and saved routes"
        icon={<Watch size={22} color={c.text} />}
        onPress={() => router.push("./watch")}
      />
      <Txt size="caption" color={c.muted}>Sensor readings are saved with your GPS recording.</Txt>
      <SectionHeading title="Connected" />
      {connected.map((device) => (
        <Stack
          key={device.id}
          gap={8}
          style={{
            borderBottomWidth: 1,
            borderColor: c.line,
            paddingVertical: 12,
          }}
        >
          <Txt weight="700">{device.name}</Txt>
          <Row style={{ flexWrap: "wrap" }}>
            <Txt mono>
              {device.hr !== undefined ? device.hr + " bpm" : "HR —"}
            </Txt>
            <Txt mono>
              {device.watts !== undefined ? device.watts + " W" : "Power —"}
            </Txt>
          </Row>
          <Txt size="caption" color={c.muted}>
            {device.seen
              ? `Last reading ${new Date(device.seen).toLocaleTimeString()}`
              : "Waiting for a reading…"}
          </Txt>
          <Button
            title="Disconnect"
            variant="quiet"
            loading={busy === device.id}
            onPress={() =>
              void act(device.id, () => disconnectSensor(device.id))
            }
          />
        </Stack>
      ))}
      {!connected.length && (
        <Empty
          title="No sensor connected"
          body="Wake your sensor and keep it close to your phone."
        />
      )}
      <Button
        title={scanning ? "Stop search" : "Find Bluetooth sensors"}
        disabled={!!busy}
        onPress={() => {
          if (scanning) {
            stopSensorScan();
            setScanning(false);
            return;
          }
          setDevices([]);
          setScanning(true);
          setError("");
          void scanSensors(
            (device) =>
              setDevices((list) =>
                list.some((d) => d.id === device.id) ? list : [...list, device],
              ),
            (e) => {
              setScanning(false);
              if (e) setError(userMessage(e));
            },
          ).catch((e) => {
            setScanning(false);
            setError(userMessage(e));
          });
        }}
      />
      {scanning && (
        <LoadingJourney compact label="Looking for nearby sensors…" />
      )}
      {devices
        .filter((d) => !connected.some((c) => c.id === d.id))
        .map((device) => (
          <Stack
            key={device.id}
            gap={8}
            style={{
              borderBottomWidth: 1,
              borderColor: c.line,
              paddingVertical: 12,
            }}
          >
            <Txt weight="700">
              {device.name ?? device.localName ?? "Fitness sensor"}
            </Txt>
            <Txt size="caption" color={c.muted}>
              Signal {device.rssi ?? "—"} dBm
            </Txt>
            <Button
              title="Connect"
              loading={busy === device.id}
              disabled={!profile || !!busy}
              onPress={() => {
                setScanning(false);
                void act(device.id, () =>
                  connectSensor(device.id, profile!.id),
                );
              }}
            />
          </Stack>
        ))}
      <Txt size="caption" color={c.muted}>
        Connect again after restarting the app. If readings stop, wake your
        sensor, keep it nearby and reconnect.
      </Txt>
    </Screen>
  );
}
