import { useState } from "react";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  eachDayOfInterval
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";
import { Button } from "@heroui/react/button";
import { Tooltip } from "@heroui/react/tooltip";

interface Props {
  selectedDate: Date | null;
  onChange: (date: Date | null) => void;
  onClose: () => void;
  className?: string;
}

export function CalendarPopup({ selectedDate, onChange, onClose, className }: Props) {
  const { t, i18n } = useTranslation();
  const [currentMonth, setCurrentMonth] = useState(selectedDate || new Date());

  const locale = i18n.language.startsWith('zh') ? zhCN : enUS;

  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(currentMonth)),
    end: endOfWeek(endOfMonth(currentMonth))
  });

  const dayNames = t('calendar.days', { returnObjects: true }) as string[];

  return (
    <div className={cn("p-4 w-[280px]", className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-sm font-black tracking-tight text-foreground">
          {format(currentMonth, "MMMM yyyy", { locale })}
        </h3>
        <div className="flex gap-1">
          <Tooltip delay={300} closeDelay={0}>
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-lg p-1.5 text-muted transition-colors hover:bg-default"
              aria-label={t("calendar.previous_month")}
            >
              <ChevronLeft size={16} />
            </Button>
            <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
              <Tooltip.Arrow className="fill-overlay" />
              {t("calendar.previous_month")}
            </Tooltip.Content>
          </Tooltip>
          <Tooltip delay={300} closeDelay={0}>
            <Button
              isIconOnly
              variant="ghost"
              onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="h-8 w-8 rounded-lg p-1.5 text-muted transition-colors hover:bg-default"
              aria-label={t("calendar.next_month")}
            >
              <ChevronRight size={16} />
            </Button>
            <Tooltip.Content className="rounded-lg border border-border bg-overlay px-2.5 py-1.5 text-xs font-semibold text-overlay-foreground shadow-md" placement="top" showArrow>
              <Tooltip.Arrow className="fill-overlay" />
              {t("calendar.next_month")}
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map(name => (
          <div key={name} className="text-center text-[10px] font-black text-muted uppercase tracking-widest py-1">
            {name}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          const isSelected = selectedDate && isSameDay(day, selectedDate);
          const isCurrentMonth = isSameMonth(day, currentMonth);
          const isToday = isSameDay(day, new Date());

          return (
            <Button
              key={i}
              variant="ghost"
              onPress={() => {
                onChange(day);
                onClose();
              }}
              className={cn(
                "relative flex h-8 min-h-0 w-8 items-center justify-center rounded-lg text-xs font-bold transition-all",
                !isCurrentMonth && "opacity-20",
                isSelected
                  ? "bg-accent text-accent-foreground shadow-sm"
                  : "hover:bg-default text-foreground"
              )}
            >
              {format(day, "d")}
              {isToday && !isSelected && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-accent" />
              )}
            </Button>
          );
        })}
      </div>

      {/* Quick Select Today */}
      <div className="mt-4 pt-3 border-t border-border flex flex-col gap-1">
         <Button
           variant="ghost"
           onPress={() => {
             const today = new Date();
             onChange(today);
             onClose();
           }}
           className="w-full py-1.5 text-[10px] font-black text-accent uppercase tracking-[0.2em] hover:bg-accent/5 rounded-lg transition-colors"
         >
           {t('common.today')}
         </Button>

         {selectedDate && (
           <Button
             variant="ghost"
             onPress={() => {
               onChange(null);
               onClose();
             }}
             className="w-full py-1.5 text-[10px] font-black text-danger uppercase tracking-[0.2em] hover:bg-danger/5 rounded-lg transition-colors"
           >
             {t('tasks.clear_due_date')}
           </Button>
         )}
      </div>
    </div>
  );
}
