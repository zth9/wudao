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
import { WudaoButton, WudaoIconButton } from "../ui/heroui";

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
        <h3 className="text-sm font-black tracking-tight text-foreground dark:text-white">
          {format(currentMonth, "MMMM yyyy", { locale })}
        </h3>
        <div className="flex gap-1">
          <WudaoIconButton
            onPress={() => setCurrentMonth(subMonths(currentMonth, 1))}
            tone="ghost"
            className="h-8 w-8 rounded-apple-lg p-1.5 text-system-gray-400 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            tooltip={t("calendar.previous_month")}
            aria-label={t("calendar.previous_month")}
          >
            <ChevronLeft size={16} />
          </WudaoIconButton>
          <WudaoIconButton
            onPress={() => setCurrentMonth(addMonths(currentMonth, 1))}
            tone="ghost"
            className="h-8 w-8 rounded-apple-lg p-1.5 text-system-gray-400 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            tooltip={t("calendar.next_month")}
            aria-label={t("calendar.next_month")}
          >
            <ChevronRight size={16} />
          </WudaoIconButton>
        </div>
      </div>

      {/* Day Names */}
      <div className="grid grid-cols-7 mb-2">
        {dayNames.map(name => (
          <div key={name} className="text-center text-[10px] font-black text-system-gray-400 uppercase tracking-widest py-1">
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
            <WudaoButton
              key={i}
              onPress={() => {
                onChange(day);
                onClose();
              }}
              tone="plain"
              className={cn(
                "relative flex h-8 min-h-0 w-8 items-center justify-center rounded-apple-lg text-xs font-bold transition-all",
                !isCurrentMonth && "opacity-20",
                isSelected 
                  ? "bg-apple-blue text-white shadow-apple-sm" 
                  : "hover:bg-black/5 dark:hover:bg-white/10 text-foreground dark:text-system-gray-200"
              )}
            >
              {format(day, "d")}
              {isToday && !isSelected && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-apple-blue" />
              )}
            </WudaoButton>
          );
        })}
      </div>

      {/* Quick Select Today */}
      <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/10 flex flex-col gap-1">
         <WudaoButton
           onPress={() => {
             const today = new Date();
             onChange(today);
             onClose();
           }}
           tone="plain"
           className="w-full py-1.5 text-[10px] font-black text-apple-blue uppercase tracking-[0.2em] hover:bg-apple-blue/5 rounded-apple-lg transition-colors"
         >
           {t('common.today')}
         </WudaoButton>

         {selectedDate && (
           <WudaoButton
             onPress={() => {
               onChange(null);
               onClose();
             }}
             tone="plain"
             className="w-full py-1.5 text-[10px] font-black text-apple-red uppercase tracking-[0.2em] hover:bg-apple-red/5 rounded-apple-lg transition-colors"
           >
             {t('tasks.clear_due_date')}
           </WudaoButton>
         )}
      </div>
    </div>
  );
}
