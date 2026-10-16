import React, { useCallback, useRef, useState } from "react";
import { AppState, Image, Linking } from "react-native";
import { useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { voiceFoodDraft, type VoiceFoodDraft } from "../domain/voice-food";
import { Button, Field, Stack, Txt } from "./primitives";
import { useTheme } from "./theme";
import { userMessage } from "../security/errors";

function discardPickerCopy(uri: string | null) {
  // Only delete the picker-owned cache copy, never the athlete's original library asset.
  if (
    uri &&
    FileSystem.cacheDirectory &&
    uri.startsWith(FileSystem.cacheDirectory) &&
    uri.includes("/ImagePicker/")
  )
    void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}
export function NutritionIntakeAssist({
  disabled = false,
  onDraft,
}: {
  disabled?: boolean;
  onDraft: (draft: VoiceFoodDraft) => void;
}) {
  const { c } = useTheme();
  const [photo, setPhoto] = useState<string | null>(null),
    [transcript, setTranscript] = useState(""),
    [error, setError] = useState(""),
    [listening, setListening] = useState(false),
    [preparing, setPreparing] = useState(false),
    [picking, setPicking] = useState(false),
    [denied, setDenied] = useState(false);
  const photoRef = useRef<string | null>(null),
    focused = useRef(false),
    generation = useRef(0),
    voiceOwn = useRef(false),
    voiceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pickLock = useRef(false),
    voicePending = useRef(false);
  const clearPhoto = useCallback(() => {
    discardPickerCopy(photoRef.current);
    photoRef.current = null;
    setPhoto(null);
  }, []);
  const abort = useCallback(() => {
    generation.current++;
    voicePending.current = false;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (voiceOwn.current) {
      voiceOwn.current = false;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {}
    }
    setPreparing(false);
    setListening(false);
  }, []);
  const stop = useCallback(() => {
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      abort();
      return;
    }
    // A missing native end event must not leave the form locked indefinitely.
    voiceTimer.current = setTimeout(abort, 5000);
  }, [abort]);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const state = AppState.addEventListener("change", (next) => {
        if (next !== "active" && voiceOwn.current) abort();
      });
      return () => {
        focused.current = false;
        abort();
        clearPhoto();
        setTranscript("");
        setError("");
        state.remove();
      };
    }, [abort, clearPhoto]),
  );
  useSpeechRecognitionEvent("start", () => {
    if (voiceOwn.current && focused.current) {
      setPreparing(false);
      setListening(true);
    }
  });
  useSpeechRecognitionEvent("result", (event) => {
    if (
      voiceOwn.current &&
      focused.current &&
      AppState.currentState === "active"
    ) {
      const text = event.results[0]?.transcript;
      if (text) setTranscript(text.slice(0, 300));
    }
  });
  useSpeechRecognitionEvent("end", () => {
    if (!voiceOwn.current) return;
    voiceOwn.current = false;
    voicePending.current = false;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (focused.current) {
      setListening(false);
      setPreparing(false);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    if (!voiceOwn.current) return;
    voiceOwn.current = false;
    voicePending.current = false;
    if (voiceTimer.current) clearTimeout(voiceTimer.current);
    if (focused.current) {
      setListening(false);
      setPreparing(false);
      if (event.error === "not-allowed") setDenied(true);
      if (event.error !== "aborted")
        setError(
          event.error === "not-allowed"
            ? "Allow microphone and speech access in Settings."
            : event.error === "network"
              ? "Speech is offline. Type the food name instead."
              : "Speech could not finish. Try again or type the food name.",
        );
    }
  });
  async function pickPhoto() {
    if (
      disabled ||
      pickLock.current ||
      voicePending.current ||
      voiceOwn.current
    )
      return;
    pickLock.current = true;
    setPicking(true);
    setError("");
    const token = generation.current;
    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setDenied(true);
        throw new Error("Allow Photos access to choose a reference.");
      }
      if (!focused.current || token !== generation.current) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        allowsMultipleSelection: false,
        exif: false,
      });
      const uri = !result.canceled ? result.assets[0]?.uri : null;
      if (uri) {
        if (focused.current && token === generation.current) {
          discardPickerCopy(photoRef.current);
          photoRef.current = uri;
          setPhoto(uri);
        } else discardPickerCopy(uri);
      }
    } catch (e) {
      if (focused.current) setError(userMessage(e));
    } finally {
      pickLock.current = false;
      if (focused.current) setPicking(false);
    }
  }
  async function voice() {
    if (
      disabled ||
      pickLock.current ||
      voicePending.current ||
      voiceOwn.current
    )
      return;
    voicePending.current = true;
    setPreparing(true);
    setError("");
    setDenied(false);
    setTranscript("");
    const token = ++generation.current;
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable())
        throw new Error(
          "Speech recognition is unavailable on this phone. Type the food name instead.",
        );
      const permission =
        await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (
        !focused.current ||
        token !== generation.current ||
        AppState.currentState !== "active"
      )
        return;
      if (!permission.granted) {
        setDenied(true);
        throw new Error("Allow microphone and speech access in Settings.");
      }
      voiceOwn.current = true;
      ExpoSpeechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        continuous: false,
        maxAlternatives: 1,
        recordingOptions: { persist: false },
      });
      voiceTimer.current = setTimeout(stop, 30000);
    } catch (e) {
      voiceOwn.current = false;
      if (focused.current && token === generation.current)
        setError(userMessage(e));
    } finally {
      voicePending.current = false;
      if (focused.current && token === generation.current) setPreparing(false);
    }
  }
  return (
    <Stack gap={12}>
      <Button
        title={picking ? "Opening photos…" : "Choose photo reference"}
        variant="secondary"
        disabled={disabled || picking || listening || preparing}
        onPress={() => void pickPhoto()}
      />
      {!!photo && (
        <>
          <Image
            source={{ uri: photo }}
            accessibilityLabel="Temporary food reference"
            resizeMode="contain"
            style={{ height: 180, width: "100%", borderRadius: 12 }}
          />
          <Txt size="caption" color={c.muted}>
            Reference only. Search the food and confirm its measured grams
            below.
          </Txt>
          <Button title="Remove photo" variant="quiet" onPress={clearPhoto} />
        </>
      )}
      {listening ? (
        <Button title="Stop listening" variant="secondary" onPress={stop} />
      ) : preparing ? (
        <Button title="Cancel voice" variant="quiet" onPress={abort} />
      ) : (
        <Button
          title="Say a food"
          variant="secondary"
          disabled={disabled || picking}
          onPress={() => void voice()}
        />
      )}
      <Txt size="caption" color={c.muted}>
        {listening
          ? "Listening… say one food and its measured grams."
          : "Uses your phone’s speech service. Review the words before searching."}
      </Txt>
      {!!transcript && (
        <>
          <Field
            label="Review what you said"
            value={transcript}
            onChangeText={setTranscript}
            maxLength={300}
            editable={!listening && !preparing && !disabled}
          />
          <Button
            title="Use these words"
            variant="secondary"
            disabled={disabled || listening || preparing}
            onPress={() => {
              try {
                onDraft(voiceFoodDraft(transcript));
                setTranscript("");
                setError("");
              } catch (e) {
                setError(userMessage(e));
              }
            }}
          />
        </>
      )}
      {!!error && <Txt color={c.muted}>{error}</Txt>}
      {denied && (
        <Button
          title="Open Settings"
          variant="quiet"
          onPress={() =>
            void Linking.openSettings().catch(() =>
              setError("Open your phone settings to allow access."),
            )
          }
        />
      )}
    </Stack>
  );
}
