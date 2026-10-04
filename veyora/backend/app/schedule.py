"""Doctor availability, computed relative to the real runtime date.

No hardcoded schedules: slots are derived from each doctor's weekly
roster and the current date in the display timezone (Asia/Kolkata).
All appointments are in-clinic visits.
"""
from datetime import date, datetime, time, timedelta, timezone

from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Kolkata")

# Weekly roster: ISO weekday (Mon=1..Sun=7) -> list of (start, end) clinic windows.
# Slots are 30 minutes; the last slot starts 30 min before the window closes.
DOCTOR_ROSTER = {
    "Dr. Meera Iyer": {1: [(time(9, 0), time(12, 30))],
                       3: [(time(9, 0), time(12, 30))],
                       5: [(time(9, 0), time(12, 30))]},
    "Dr. Rohan Deshpande": {2: [(time(14, 0), time(17, 30))],
                            4: [(time(14, 0), time(17, 30))],
                            6: [(time(14, 0), time(17, 30))]},
}

SLOT_MINUTES = 30


def now_ist() -> datetime:
    return datetime.now(TZ)


def today_ist() -> date:
    return now_ist().date()


def slots_for(doctor_name: str, day: date) -> list[str]:
    """Return the "HH:MM" start times a doctor offers on a given date."""
    roster = DOCTOR_ROSTER.get(doctor_name, {})
    windows = roster.get(day.isoweekday(), [])
    out: list[str] = []
    for start, end in windows:
        cur = datetime.combine(day, start)
        stop = datetime.combine(day, end)
        while cur + timedelta(minutes=SLOT_MINUTES) <= stop:
            out.append(cur.strftime("%H:%M"))
            cur += timedelta(minutes=SLOT_MINUTES)
    return out


def works_on(doctor_name: str, day: date) -> bool:
    return bool(DOCTOR_ROSTER.get(doctor_name, {}).get(day.isoweekday()))


def is_slot_bookable(doctor_name: str, day: date, start_time: str,
                     horizon_days: int, lead_minutes: int) -> tuple[bool, str]:
    """Validate a requested slot against real time. Returns (ok, reason)."""
    today = today_ist()
    if day < today:
        return False, "Slot is in the past."
    if day > today + timedelta(days=horizon_days):
        return False, f"Slots can only be booked up to {horizon_days} days ahead."
    if start_time not in slots_for(doctor_name, day):
        return False, "That time is outside the doctor's clinic hours."
    if day == today:
        try:
            hh, mm = map(int, start_time.split(":"))
        except ValueError:
            return False, "Invalid time format."
        slot_dt = datetime.combine(day, time(hh, mm), tzinfo=TZ)
        if slot_dt <= now_ist() + timedelta(minutes=lead_minutes):
            return False, "Same-day slots need at least 60 minutes of notice."
    return True, ""
