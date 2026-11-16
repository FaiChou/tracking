// Copy/paste can introduce whitespace, controls and invisible Unicode formatting.
// Preserve visible characters, punctuation and case rather than guessing a carrier's format.
const TRACKING_ARTIFACTS = String.raw`\p{White_Space}\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}`;
const ALL_TRACKING_ARTIFACTS = new RegExp(`[${TRACKING_ARTIFACTS}]+`, "gu");
const LEADING_TRACKING_ARTIFACTS = new RegExp(`^[${TRACKING_ARTIFACTS}]+`, "u");

export function normalizeTrackingNumber(value: string): string {
  return value.replace(ALL_TRACKING_ARTIFACTS, "");
}

export function parseTrackingInput(input: string): { trackingNumber: string; note: string | null }[] {
  return input.split("\n").flatMap(line => {
    // Keep the existing "number SPACE note" syntax and leave note content alone.
    const trimmedLine = line.replace(LEADING_TRACKING_ARTIFACTS, "").trim();
    const firstSpaceIndex = trimmedLine.indexOf(" ");
    const trackingNumber = normalizeTrackingNumber(
      firstSpaceIndex === -1 ? trimmedLine : trimmedLine.slice(0, firstSpaceIndex),
    );
    if (!trackingNumber) return [];
    const note = firstSpaceIndex === -1 ? null : trimmedLine.slice(firstSpaceIndex + 1).trim() || null;
    return [{ trackingNumber, note }];
  });
}

export function buildTrackingUrl(baseUrl: string, trackingNumber: string): string | null {
  const number = normalizeTrackingNumber(trackingNumber);
  return number ? `${baseUrl}${encodeURIComponent(number)}` : null;
}

export function build17TrackUrl(trackingNumbers: readonly string[]): string | null {
  const numbers = trackingNumbers.map(normalizeTrackingNumber).filter(Boolean);
  return numbers.length
    ? `https://t.17track.net/zh-cn#nums=${numbers.map(encodeURIComponent).join(",")}`
    : null;
}
