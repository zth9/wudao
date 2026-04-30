import { useCallback } from "react";
import type { DateValue } from "@internationalized/date";
import { parseDate } from "@internationalized/date";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { Button } from "@heroui/react/button";
import { Calendar } from "@heroui/react/calendar";

interface Props {
  selectedDate: Date | null;
  onChange: (date: Date | null) => void;
  onClose: () => void;
  className?: string;
}

function dateToDateValue(date: Date): DateValue {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return parseDate(`${year}-${month}-${day}`);
}

function dateValueToDate(value: DateValue): Date {
  return new Date(value.year, value.month - 1, value.day);
}

export function CalendarPopup({ selectedDate, onChange, onClose, className }: Props) {
  const { t } = useTranslation();

  const handleChange = useCallback(
    (value: DateValue | null) => {
      if (value) {
        onChange(dateValueToDate(value));
        onClose();
      }
    },
    [onChange, onClose],
  );

  const handleToday = useCallback(() => {
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    onChange(todayDate);
    onClose();
  }, [onChange, onClose]);

  const handleClear = useCallback(() => {
    onChange(null);
    onClose();
  }, [onChange, onClose]);

  const calendarValue = selectedDate ? dateToDateValue(selectedDate) : null;

  return (
    <div className={cn("p-4 w-[280px]", className)}>
      <Calendar
        aria-label={t("calendar.due_date")}
        value={calendarValue}
        onChange={handleChange}
      >
        <Calendar.Header>
          <Calendar.Heading className="text-sm font-black tracking-tight text-foreground" />
          <Calendar.NavButton slot="previous" />
          <Calendar.NavButton slot="next" />
        </Calendar.Header>
        <Calendar.Grid>
          <Calendar.GridHeader>
            {(day) => (
              <Calendar.HeaderCell className="text-[10px] font-black text-muted uppercase tracking-widest">
                {day}
              </Calendar.HeaderCell>
            )}
          </Calendar.GridHeader>
          <Calendar.GridBody>
            {(date) => <Calendar.Cell date={date} />}
          </Calendar.GridBody>
        </Calendar.Grid>
      </Calendar>

      {/* Quick Select */}
      <div className="mt-4 pt-3 border-t border-border flex flex-col gap-1">
        <Button
          variant="ghost"
          onPress={handleToday}
          className="w-full py-1.5 text-[10px] font-black text-accent uppercase tracking-[0.2em] hover:bg-accent/5 rounded-lg transition-colors"
        >
          {t("common.today")}
        </Button>

        {selectedDate && (
          <Button
            variant="ghost"
            onPress={handleClear}
            className="w-full py-1.5 text-[10px] font-black text-danger uppercase tracking-[0.2em] hover:bg-danger/5 rounded-lg transition-colors"
          >
            {t("tasks.clear_due_date")}
          </Button>
        )}
      </div>
    </div>
  );
}
