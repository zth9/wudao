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
  addDays, 
  eachDayOfInterval 
} from "date-fns";
import { zhCN, enUS } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "../../utils/cn";

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
    <motion.div
      initial={{ opacity: 0, scale: 0.95, y: 10, x: "-50%" }}
      animate={{ opacity: 1, scale: 1, y: 0, x: "-50%" }}
      exit={{ opacity: 0, scale: 0.95, y: 10, x: "-50%" }}
      className={cn("apple-dropdown p-4 w-[280px]", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4 px-1">
        <h3 className="text-sm font-black tracking-tight text-foreground dark:text-white">
          {format(currentMonth, "MMMM yyyy", { locale })}
        </h3>
        <div className="flex gap-1">
          <button 
            onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
            className="p-1.5 rounded-apple-lg hover:bg-black/5 dark:hover:bg-white/10 text-system-gray-400 transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <button 
            onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
            className="p-1.5 rounded-apple-lg hover:bg-black/5 dark:hover:bg-white/10 text-system-gray-400 transition-colors"
          >
            <ChevronRight size={16} />
          </button>
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
            <button
              key={i}
              onClick={() => {
                onChange(day);
                onClose();
              }}
              className={cn(
                "h-8 rounded-apple-lg text-xs font-bold transition-all relative flex items-center justify-center",
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
            </button>
          );
        })}
      </div>

      {/* Quick Select Today */}
      <div className="mt-4 pt-3 border-t border-black/5 dark:border-white/10 flex flex-col gap-1">
         <button 
           onClick={() => {
             const today = new Date();
             onChange(today);
             onClose();
           }}
           className="w-full py-1.5 text-[10px] font-black text-apple-blue uppercase tracking-[0.2em] hover:bg-apple-blue/5 rounded-apple-lg transition-colors"
         >
           {t('common.today')}
         </button>

         {selectedDate && (
           <button
             onClick={() => {
               onChange(null);
               onClose();
             }}
             className="w-full py-1.5 text-[10px] font-black text-apple-red uppercase tracking-[0.2em] hover:bg-apple-red/5 rounded-apple-lg transition-colors"
           >
             {t('tasks.clear_due_date')}
           </button>
         )}
      </div>
    </motion.div>
  );
}
