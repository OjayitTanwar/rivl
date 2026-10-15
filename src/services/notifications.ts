import { AppFailure } from "../security/errors";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
export async function scheduleReminder(hour = 18) {
  if (Platform.OS === "web")
    throw new AppFailure(
      "validation",
      "Training reminders are available in the iOS and Android app.",
    );
  const p = await Notifications.requestPermissionsAsync();
  if (!p.granted)
    throw new AppFailure(
      "validation",
      "Allow notifications in Settings to set a reminder.",
    );
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("training", {
      name: "Training reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  return Notifications.scheduleNotificationAsync({
    content: {
      title: "A little time for you.",
      body: "Check your training plan and see how you feel.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute: 0,
      channelId: "training",
    },
  });
}
export async function cancelReminder(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id);
}
