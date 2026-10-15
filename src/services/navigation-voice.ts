import * as Speech from "expo-speech";

export interface NavigationVoice {
  id: string;
  name: string;
  language: string;
  enhanced: boolean;
}
let selectedVoice: NavigationVoice | undefined;
let loaded = false;
let preparing: Promise<void> | undefined;
let generation = 0;
let operations: Promise<void> = Promise.resolve();
let lastMessage = "";
let currentOwner: string | undefined;
let lastSpokenAt = 0;
const noveltyVoices = new Set([
  "albert",
  "bad news",
  "bahh",
  "bells",
  "boing",
  "bubbles",
  "cellos",
  "deranged",
  "good news",
  "hysterical",
  "jester",
  "organ",
  "trinoids",
  "whisper",
  "wobble",
  "zarvox",
]);

/** One stable English voice per session; installed high-quality voices win.
 * Expo exposes premium Apple voices as Enhanced, so their identifier is a tie-breaker.
 * Android network-only voices are skipped to keep guidance usable offline.
 */
export function chooseNavigationVoice(
  voices: Speech.Voice[],
): NavigationVoice | undefined {
  const score = (voice: Speech.Voice) => {
    const identity = `${voice.identifier} ${voice.name}`.toLowerCase();
    const language = voice.language.toLowerCase().replaceAll("_", "-");
    return (
      (voice.quality === Speech.VoiceQuality.Enhanced ? 100 : 0) +
      (/premium/.test(identity) ? 200 : 0) +
      (language === "en-in" ? 30 : language === "en-us" ? 20 : 10) +
      (/ava|samantha|karen|moira|rishi/.test(identity) ? 1 : 0)
    );
  };
  const voice = voices
    .filter((candidate) => {
      const name = candidate.name
        .toLowerCase()
        .replace(/\s*\(.*\)$/, "")
        .trim();
      return (
        /^en(?:[-_]|$)/i.test(candidate.language) &&
        !noveltyVoices.has(name) &&
        !/(?:^|[-_.])network(?:$|[-_.])/i.test(candidate.identifier)
      );
    })
    .sort(
      (a, b) => score(b) - score(a) || a.identifier.localeCompare(b.identifier),
    )[0];
  return voice
    ? {
        id: voice.identifier,
        name: voice.name,
        language: voice.language.replaceAll("_", "-"),
        enhanced:
          voice.quality === Speech.VoiceQuality.Enhanced ||
          /premium/i.test(voice.identifier),
      }
    : undefined;
}

export async function prepareNavigationVoice(): Promise<void> {
  if (loaded) return;
  if (!preparing) {
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<Speech.Voice[]>((resolve) => {
      deadline = setTimeout(() => resolve([]), 2000);
    });
    preparing = Promise.race([Speech.getAvailableVoicesAsync(), timedOut])
      .then((voices) => {
        selectedVoice = chooseNavigationVoice(voices);
        // A cold Android engine can return no voices; let a later request retry.
        loaded = voices.length > 0;
      })
      .catch(() => {
        // Native default English voice remains usable; retry discovery next time.
      })
      .finally(() => {
        if (deadline) clearTimeout(deadline);
        preparing = undefined;
      });
  }
  await preparing;
}

export function currentNavigationVoice(): NavigationVoice | undefined {
  return selectedVoice;
}

function enqueue(operation: () => Promise<void>): void {
  // Serialize native stops: an old delayed stop must never silence a newer turn.
  operations = operations.then(operation).catch(() => {});
}

export function speakNavigation(
  message: string,
  options: { repeat?: boolean; owner?: string } = {},
): void {
  const text = message.trim();
  if (!text) return;
  const now = Date.now();
  if (!options.repeat && text === lastMessage && now - lastSpokenAt < 1500)
    return;
  currentOwner = options.owner;
  lastMessage = text;
  lastSpokenAt = now;
  const current = ++generation;
  enqueue(async () => {
    await prepareNavigationVoice();
    if (current !== generation) return;
    await Speech.stop();
    if (current !== generation) return;
    const voice = selectedVoice;
    let fallbackAttempted = false;
    const speechOptions: Speech.SpeechOptions = {
      language: voice?.language ?? "en-US",
      voice: voice?.id,
      rate: 1,
      pitch: 1,
      useApplicationAudioSession: false,
      onError: () => {
        if (current !== generation || !voice || fallbackAttempted) return;
        fallbackAttempted = true;
        // A downloaded voice may have been removed. Retry this turn once with
        // the OS default; stale failures cannot resurrect an old instruction.
        selectedVoice = undefined;
        loaded = false;
        enqueue(async () => {
          if (current !== generation) return;
          await Speech.stop();
          if (current !== generation) return;
          Speech.speak(text, {
            ...speechOptions,
            voice: undefined,
            onError: undefined,
          });
        });
      },
    };
    try {
      Speech.speak(text, speechOptions);
    } catch {
      speechOptions.onError?.(new Error("Voice unavailable"));
    }
  });
}

export function stopNavigationVoice(owner?: string): void {
  if (owner !== undefined && currentOwner !== owner) return;
  currentOwner = undefined;
  generation++;
  lastMessage = "";
  lastSpokenAt = 0;
  enqueue(async () => {
    await Speech.stop();
  });
}
