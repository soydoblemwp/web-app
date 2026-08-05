import { getZonedParts, zonedTimeToUtc } from "./time-zones";

export interface Participant {
  id: string;
  label: string;
  timeZone: string;
  workStartMinutes: number; // minutes since local midnight
  workEndMinutes: number; // minutes since local midnight
  workDays: number[]; // 0=Sunday..6=Saturday
}

export interface MeetingSlot {
  utcInstant: Date;
  participants: {
    id: string;
    localHour: number;
    localMinute: number;
    localWeekday: number;
    dayOffset: number; // -1 = previous local day, 0 = same day, 1 = next local day, relative to the anchor date
    withinWorkHours: boolean;
    abbreviation: string;
    offsetMinutes: number;
  }[];
  allAvailable: boolean;
  majorityAvailable: boolean;
  availableCount: number;
}

export interface PlanMeetingsInput {
  anchorYear: number;
  anchorMonth: number;
  anchorDay: number;
  anchorTimeZone: string; // the calendar date is interpreted in this participant's local day
  participants: Participant[];
  intervalMinutes: number;
  meetingDurationMinutes: number;
}

function isWithinWorkHours(minutesSinceMidnight: number, weekday: number, participant: Participant): boolean {
  if (!participant.workDays.includes(weekday)) return false;
  return minutesSinceMidnight >= participant.workStartMinutes && minutesSinceMidnight + 0 < participant.workEndMinutes;
}

/** Builds one candidate meeting slot every `intervalMinutes` across the anchor's local day (00:00 to 24:00), evaluated against every participant's real local time via IANA zone conversion. */
export function planMeetings(input: PlanMeetingsInput): MeetingSlot[] {
  const slots: MeetingSlot[] = [];
  const stepsPerDay = Math.floor((24 * 60) / input.intervalMinutes);

  // The anchor day's local midnight, expressed as a real UTC instant.
  const dayStartUtc = zonedTimeToUtc(input.anchorYear, input.anchorMonth, input.anchorDay, 0, 0, input.anchorTimeZone);

  for (let step = 0; step < stepsPerDay; step++) {
    const utcInstant = new Date(dayStartUtc.getTime() + step * input.intervalMinutes * 60000);
    const participantStates = input.participants.map((p) => {
      const zoned = getZonedParts(utcInstant, p.timeZone);
      const minutesSinceMidnight = zoned.hour * 60 + zoned.minute;
      const withinWorkHours = isWithinWorkHours(minutesSinceMidnight, zoned.weekday, p) && isWithinWorkHours(minutesSinceMidnight + input.meetingDurationMinutes - 1, zoned.weekday, p);
      return {
        id: p.id,
        localHour: zoned.hour,
        localMinute: zoned.minute,
        localWeekday: zoned.weekday,
        dayOffset: 0,
        withinWorkHours,
        abbreviation: zoned.abbreviation,
        offsetMinutes: zoned.offsetMinutes,
      };
    });
    const availableCount = participantStates.filter((p) => p.withinWorkHours).length;
    slots.push({
      utcInstant,
      participants: participantStates,
      allAvailable: availableCount === input.participants.length,
      majorityAvailable: availableCount > input.participants.length / 2,
      availableCount,
    });
  }
  return slots;
}
