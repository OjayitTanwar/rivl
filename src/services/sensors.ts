import { PermissionsAndroid, Platform } from "react-native";
import {
  BleManager,
  type Device,
  type Subscription,
  State,
} from "react-native-ble-plx";
import { toByteArray } from "base64-js";
import {
  heartRateMeasurement,
  cyclingPowerMeasurement,
  sensorReadings,
} from "../domain/sensor-measurements";
import { AppFailure } from "../security/errors";
const HR = "0000180d-0000-1000-8000-00805f9b34fb",
  POWER = "00001818-0000-1000-8000-00805f9b34fb";
let manager: BleManager | undefined,
  scanTimer: ReturnType<typeof setTimeout> | undefined;
type Connection = {
  id: string;
  name: string;
  owner: string;
  subscriptions: Subscription[];
  hr?: number;
  watts?: number;
  seen?: number;
};
const connections = new Map<string, Connection>(),
  listeners = new Set<() => void>();
const notify = () => listeners.forEach((f) => f());
export const subscribeSensors = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const connectedSensors = (owner: string) =>
  [...connections.values()]
    .filter((d) => d.owner === owner)
    .map(({ subscriptions, ...rest }) => rest);
async function bluetooth() {
  if (Platform.OS === "web")
    throw new AppFailure(
      "validation",
      "Bluetooth sensors require the iPhone or Android app.",
    );
  if (Platform.OS === "android") {
    const permissions =
      Number(Platform.Version) >= 31
        ? [
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
          ]
        : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
    const grants = await PermissionsAndroid.requestMultiple(permissions);
    if (
      permissions.some((p) => grants[p] !== PermissionsAndroid.RESULTS.GRANTED)
    )
      throw new AppFailure(
        "forbidden",
        "Allow Nearby Devices permission in Settings to pair a sensor.",
      );
  }
  manager ??= new BleManager();
  let state = await manager.state();
  if (state === State.Unknown || state === State.Resetting)
    state = await new Promise<State>((resolve) => {
      const timeout = setTimeout(() => {
        subscription.remove();
        resolve(State.Unknown);
      }, 5000);
      const subscription = manager!.onStateChange((next) => {
        if (next !== State.Unknown && next !== State.Resetting) {
          clearTimeout(timeout);
          subscription.remove();
          resolve(next);
        }
      }, false);
    });
  if (state !== State.PoweredOn)
    throw new AppFailure(
      "forbidden",
      state === State.Unauthorized
        ? "Allow Bluetooth permission in Settings."
        : state === State.Unsupported
          ? "This device does not support Bluetooth sensors."
          : "Turn Bluetooth on in Settings, then retry.",
    );
  return manager;
}
export function stopSensorScan() {
  clearTimeout(scanTimer);
  scanTimer = undefined;
  void manager?.stopDeviceScan().catch(() => {});
}
export async function scanSensors(
  found: (device: Device) => void,
  done: (error?: unknown) => void,
) {
  const ble = await bluetooth();
  stopSensorScan();
  await ble.startDeviceScan(
    [HR, POWER],
    { allowDuplicates: false },
    (error, device) => {
      if (error) {
        stopSensorScan();
        done(error);
      } else if (device) found(device);
    },
  );
  scanTimer = setTimeout(() => {
    stopSensorScan();
    done();
  }, 15000);
}
export async function connectSensor(id: string, owner: string) {
  const ble = await bluetooth();
  stopSensorScan();
  if (connections.has(id)) return;
  const device = await ble.connectToDevice(id, { timeout: 15000 });
  const entry: Connection = {
    id,
    name: device.name ?? device.localName ?? "Fitness sensor",
    owner,
    subscriptions: [],
  };
  try {
    await device.discoverAllServicesAndCharacteristics();
    const services = await device.services();
    for (const [service, characteristic, kind, decode] of [
      [HR, "00002a37-0000-1000-8000-00805f9b34fb", "hr", heartRateMeasurement],
      [
        POWER,
        "00002a63-0000-1000-8000-00805f9b34fb",
        "watts",
        cyclingPowerMeasurement,
      ],
    ] as const) {
      if (!services.some((s) => s.uuid.toLowerCase() === service)) continue;
      entry.subscriptions.push(
        device.monitorCharacteristicForService(
          service,
          characteristic,
          (error, value) => {
            if (error) {
              entry[kind] = undefined;
              sensorReadings.disconnect(id);
              notify();
              return;
            }
            try {
              const reading = value?.value
                ? decode(toByteArray(value.value))
                : null;
              if (reading !== null) {
                const t = Date.now();
                entry[kind] = reading;
                entry.seen = t;
                sensorReadings.add(id, owner, kind, reading, t);
                notify();
              }
            } catch {}
          },
        ),
      );
    }
    if (!entry.subscriptions.length)
      throw new AppFailure(
        "validation",
        "This sensor does not expose standard heart-rate or cycling-power readings.",
      );
    connections.set(id, entry);
    entry.subscriptions.push(
      ble.onDeviceDisconnected(id, () => {
        entry.subscriptions.forEach((s) => s.remove());
        connections.delete(id);
        sensorReadings.disconnect(id);
        notify();
      }),
    );
    notify();
  } catch (error) {
    entry.subscriptions.forEach((s) => s.remove());
    await ble.cancelDeviceConnection(id).catch(() => {});
    throw error;
  }
}
export async function disconnectSensor(id: string) {
  const entry = connections.get(id);
  entry?.subscriptions.forEach((s) => s.remove());
  connections.delete(id);
  sensorReadings.disconnect(id);
  await manager?.cancelDeviceConnection(id).catch(() => {});
  notify();
}
export async function disconnectAllSensors() {
  stopSensorScan();
  await Promise.all([...connections.keys()].map(disconnectSensor));
  sensorReadings.clear();
}
