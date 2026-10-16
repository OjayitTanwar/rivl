import { AppFailure } from "../security/errors";
export type ClubRole = "owner" | "moderator" | "member" | "visitor";
export type ClubEvent = {
  id: string;
  title: string;
  meetingPoint: string;
  startsAt: number;
  endsAt: number;
  timeZone: string;
  capacity: number;
  attending: number;
  rsvp: boolean;
  cancelled: boolean;
};
export type ClubDetail = {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  role: ClubRole;
  memberCount: number;
  members: { id: string; name: string; role: Exclude<ClubRole, "visitor"> }[];
  events: ClubEvent[];
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = (v: unknown) => typeof v === "string" && uuid.test(v);
export function validEventZone(zone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function decodeClubDetail(value: unknown): ClubDetail {
  const v = value as Record<string, unknown>;
  if (
    !v ||
    !validId(v.id) ||
    !validId(v.owner_id) ||
    typeof v.name !== "string" ||
    v.name.length > 1000 ||
    typeof v.description !== "string" ||
    v.description.length > 5000 ||
    !["owner", "moderator", "member", "visitor"].includes(String(v.role)) ||
    !Number.isInteger(v.member_count) ||
    Number(v.member_count) < 0 ||
    !Array.isArray(v.members) ||
    v.members.length > 100 ||
    !Array.isArray(v.events) ||
    v.events.length > 50
  )
    throw new Error("Invalid club details");
  const members = v.members.map((m) => {
    if (
      !m ||
      !validId(m.id) ||
      typeof m.name !== "string" ||
      m.name.length > 180 ||
      !["owner", "moderator", "member"].includes(m.role)
    )
      throw new Error("Invalid club member");
    return {
      id: m.id,
      name: m.name,
      role: m.role as Exclude<ClubRole, "visitor">,
    };
  });
  const events = v.events.map((e) => {
    const startsAt = Date.parse(e?.starts_at),
      endsAt = Date.parse(e?.ends_at);
    if (
      !e ||
      !validId(e.id) ||
      typeof e.title !== "string" ||
      e.title.length > 100 ||
      typeof e.meeting_point !== "string" ||
      e.meeting_point.length > 240 ||
      !Number.isFinite(startsAt) ||
      !Number.isFinite(endsAt) ||
      endsAt <= startsAt ||
      endsAt - startsAt > 86400000 ||
      typeof e.time_zone !== "string" ||
      !validEventZone(e.time_zone) ||
      !Number.isInteger(e.capacity) ||
      e.capacity < 1 ||
      e.capacity > 500 ||
      !Number.isInteger(e.attending) ||
      e.attending < 0 ||
      e.attending > e.capacity ||
      typeof e.cancelled !== "boolean" ||
      typeof e.rsvp !== "boolean"
    )
      throw new Error("Invalid club event");
    return {
      id: e.id,
      title: e.title,
      meetingPoint: e.meeting_point,
      startsAt,
      endsAt,
      timeZone: e.time_zone,
      capacity: e.capacity,
      attending: e.attending,
      rsvp: e.rsvp,
      cancelled: e.cancelled,
    };
  });
  return {
    id: v.id as string,
    name: v.name,
    description: v.description,
    ownerId: v.owner_id as string,
    role: v.role as ClubRole,
    memberCount: Number(v.member_count),
    members,
    events,
  };
}
export function clubEventInput(
  input: {
    title: string;
    meetingPoint: string;
    start: string;
    timeZone: string;
    duration: string;
    capacity: string;
  },
  now = Date.now(),
) {
  const fail = (text: string): never => {
    throw new AppFailure("validation", text);
  };
  const title = input.title.trim(),
    meeting = input.meetingPoint.trim(),
    zone = input.timeZone.trim();
  if (!title || title.length > 100 || !meeting || meeting.length > 240)
    fail("Enter an event title and meeting point.");
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::00)?(Z|[+-]\d{2}:\d{2})$/.exec(
      input.start.trim(),
    );
  if (!match)
    fail(
      "Use a date and time with an explicit UTC offset, such as 2026-10-20T06:00+05:30.",
    );
  const [, year, month, day, hour, minute, offset] = match!;
  const y = Number(year),
    mo = Number(month),
    d = Number(day),
    h = Number(hour),
    mi = Number(minute),
    calendar = new Date(Date.UTC(y, mo - 1, d));
  if (
    calendar.getUTCFullYear() !== y ||
    calendar.getUTCMonth() !== mo - 1 ||
    calendar.getUTCDate() !== d ||
    h > 23 ||
    mi > 59
  )
    fail("Choose a real calendar date and time.");
  const start = Date.parse(input.start.trim());
  if (
    !Number.isFinite(start) ||
    start < now + 60000 ||
    start > now + 365 * 86400000
  )
    fail("Choose a start between one minute and one year from now.");
  if (!validEventZone(zone))
    fail("Choose an IANA timezone, such as Asia/Kolkata.");
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(start);
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  if (
    part("year") !== y ||
    part("month") !== mo ||
    part("day") !== d ||
    part("hour") !== h ||
    part("minute") !== mi
  )
    fail(
      "The UTC offset does not match that timezone on this date. Check daylight saving time.",
    );
  if (!/^\d+$/.test(input.duration) || !/^\d+$/.test(input.capacity))
    fail("Use whole numbers for minutes and capacity.");
  const duration = Number(input.duration),
    capacity = Number(input.capacity);
  if (duration < 5 || duration > 1440 || capacity < 1 || capacity > 500)
    fail("Use 5–1,440 minutes and 1–500 places.");
  return {
    p_title: title,
    p_meeting_point: meeting,
    p_start: new Date(start).toISOString(),
    p_time_zone: zone,
    p_duration: duration,
    p_capacity: capacity,
  };
}
