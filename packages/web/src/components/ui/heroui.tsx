import { Button as HeroButton, type ButtonProps as HeroButtonProps } from "@heroui/react/button";
import { Card as HeroCard, type CardProps as HeroCardProps } from "@heroui/react/card";
import { Checkbox as HeroCheckbox, type CheckboxProps as HeroCheckboxProps } from "@heroui/react/checkbox";
import { Chip as HeroChip, type ChipProps as HeroChipProps } from "@heroui/react/chip";
import {
  Dropdown as HeroDropdown,
  type DropdownItemProps as HeroDropdownItemProps,
  type DropdownMenuProps as HeroDropdownMenuProps,
  type DropdownPopoverProps as HeroDropdownPopoverProps,
  type DropdownProps as HeroDropdownProps,
} from "@heroui/react/dropdown";
import { Input as HeroInput, type InputProps as HeroInputProps } from "@heroui/react/input";
import {
  Modal as HeroModal,
  type ModalBackdropProps as HeroModalBackdropProps,
  type ModalContainerProps as HeroModalContainerProps,
} from "@heroui/react/modal";
import {
  Popover as HeroPopover,
  type PopoverContentProps as HeroPopoverContentProps,
  type PopoverProps as HeroPopoverProps,
} from "@heroui/react/popover";
import { Spinner as HeroSpinner, type SpinnerProps as HeroSpinnerProps } from "@heroui/react/spinner";
import { TextArea as HeroTextArea, type TextAreaProps as HeroTextAreaProps } from "@heroui/react/textarea";
import { Tooltip as HeroTooltip, type TooltipContentProps, type TooltipProps as HeroTooltipProps } from "@heroui/react/tooltip";
import { forwardRef, type ComponentProps, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "../../utils/cn";

type WudaoButtonTone = "primary" | "secondary" | "ghost" | "danger" | "plain";

const buttonToneClass: Record<WudaoButtonTone, string> = {
  primary: "bg-apple-blue text-white hover:bg-apple-blue/90 dark:text-white",
  secondary: "bg-system-gray-100 text-foreground hover:bg-system-gray-200 dark:bg-white/5 dark:text-system-gray-100 dark:hover:bg-white/10",
  ghost: "bg-transparent text-system-gray-500 hover:bg-black/5 hover:text-apple-blue dark:text-system-gray-300 dark:hover:bg-white/5",
  danger: "bg-apple-red text-white hover:bg-apple-red/90 dark:text-white",
  plain: "bg-transparent text-current hover:bg-transparent",
};

export interface WudaoButtonProps extends Omit<HeroButtonProps, "className" | "isDisabled"> {
  className?: string;
  disabled?: boolean;
  isDisabled?: boolean;
  title?: string;
  tone?: WudaoButtonTone;
}

export const WudaoButton = forwardRef<HTMLButtonElement, WudaoButtonProps>(function WudaoButton({
  className,
  disabled,
  isDisabled,
  size = "md",
  title,
  tone = "secondary",
  variant = "tertiary",
  ...props
}, ref) {
  return (
    <HeroButton
      className={cn(
        "rounded-apple font-medium transition-all duration-200 active:scale-95 disabled:opacity-50",
        "data-[focus-visible=true]:outline data-[focus-visible=true]:outline-2 data-[focus-visible=true]:outline-offset-2 data-[focus-visible=true]:outline-apple-blue/40",
        buttonToneClass[tone],
        className,
      )}
      isDisabled={isDisabled ?? disabled}
      ref={ref}
      size={size}
      {...(title ? ({ title } as Record<string, string>) : {})}
      variant={variant}
      {...props}
    />
  );
});

export interface WudaoTooltipProps extends Omit<HeroTooltipProps, "children"> {
  children: ReactNode;
  content: ReactNode;
  contentClassName?: string;
  placement?: TooltipContentProps["placement"];
  showArrow?: boolean;
}

export function WudaoTooltip({
  children,
  content,
  contentClassName,
  delay = 300,
  closeDelay = 0,
  placement = "top",
  showArrow = true,
  ...props
}: WudaoTooltipProps) {
  return (
    <HeroTooltip closeDelay={closeDelay} delay={delay} {...props}>
      {children}
      <HeroTooltip.Content
        className={cn(
          "rounded-apple-lg border border-black/5 bg-white px-2.5 py-1.5 text-xs font-semibold text-system-gray-700 shadow-apple-md dark:border-white/10 dark:bg-system-gray-800 dark:text-system-gray-100",
          contentClassName,
        )}
        placement={placement}
        showArrow={showArrow}
      >
        {showArrow ? <HeroTooltip.Arrow className="fill-white dark:fill-system-gray-800" /> : null}
        {content}
      </HeroTooltip.Content>
    </HeroTooltip>
  );
}

export interface WudaoIconButtonProps extends WudaoButtonProps {
  tooltip?: ReactNode;
  tooltipPlacement?: TooltipContentProps["placement"];
}

export function WudaoIconButton({ className, tooltip, tooltipPlacement, ...props }: WudaoIconButtonProps) {
  const button = (
    <WudaoButton
      className={cn("h-9 w-9 shrink-0 items-center justify-center p-0", className)}
      isIconOnly
      {...props}
    />
  );

  if (!tooltip) return button;

  return (
    <WudaoTooltip content={tooltip} placement={tooltipPlacement}>
      {button}
    </WudaoTooltip>
  );
}

export interface WudaoCardProps extends Omit<HeroCardProps, "className"> {
  className?: string;
  onClick?: HTMLAttributes<HTMLDivElement>["onClick"];
}

export const WudaoCard = forwardRef<HTMLDivElement, WudaoCardProps>(function WudaoCard({ className, variant = "default", ...props }, ref) {
  return (
    <HeroCard
      className={cn(
        "rounded-apple-xl border border-black/5 bg-white shadow-apple-card dark:border-white/10 dark:bg-system-gray-800 dark:shadow-none",
        className,
      )}
      ref={ref}
      variant={variant}
      {...props}
    />
  );
});

export interface WudaoInputProps extends Omit<HeroInputProps, "className"> {
  className?: string;
}

export const WudaoInput = forwardRef<HTMLInputElement, WudaoInputProps>(function WudaoInput({ className, variant = "secondary", fullWidth = true, ...props }, ref) {
  return (
    <HeroInput
      className={cn(
        "rounded-apple border border-system-gray-200 bg-white px-3 py-1.5 text-sm outline-none transition-all",
        "focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20",
        "dark:border-white/10 dark:bg-black/40 dark:text-system-gray-100",
        className,
      )}
      fullWidth={fullWidth}
      ref={ref}
      variant={variant}
      {...props}
    />
  );
});

export interface WudaoTextAreaProps extends Omit<HeroTextAreaProps, "className"> {
  className?: string;
}

export const WudaoTextArea = forwardRef<HTMLTextAreaElement, WudaoTextAreaProps>(function WudaoTextArea({ className, variant = "secondary", fullWidth = true, ...props }, ref) {
  return (
    <HeroTextArea
      className={cn(
        "rounded-apple border border-system-gray-200 bg-white px-3 py-1.5 text-sm outline-none transition-all",
        "focus:border-apple-blue focus:ring-2 focus:ring-apple-blue/20",
        "dark:border-white/10 dark:bg-black/40 dark:text-system-gray-100",
        className,
      )}
      fullWidth={fullWidth}
      ref={ref}
      variant={variant}
      {...props}
    />
  );
});

export interface WudaoCheckboxProps extends Omit<HeroCheckboxProps, "className"> {
  className?: string;
  controlClassName?: string;
  indicatorClassName?: string;
  contentClassName?: string;
  children?: ReactNode;
}

export function WudaoCheckbox({
  children,
  className,
  contentClassName,
  controlClassName,
  indicatorClassName,
  variant = "secondary",
  ...props
}: WudaoCheckboxProps) {
  return (
    <HeroCheckbox
      className={cn("inline-flex items-center gap-3", className)}
      variant={variant}
      {...props}
    >
      <HeroCheckbox.Control
        className={cn(
          "flex h-5 w-5 items-center justify-center rounded-apple border-2 border-system-gray-300 bg-white transition-all",
          "data-[selected=true]:border-apple-blue data-[selected=true]:bg-apple-blue data-[selected=true]:text-white",
          "dark:border-white/35 dark:bg-white/[0.03]",
          controlClassName,
        )}
      >
        <HeroCheckbox.Indicator className={cn("text-white", indicatorClassName)} />
      </HeroCheckbox.Control>
      {children ? (
        <HeroCheckbox.Content className={contentClassName}>
          {children}
        </HeroCheckbox.Content>
      ) : null}
    </HeroCheckbox>
  );
}

export interface WudaoChipProps extends Omit<HeroChipProps, "className"> {
  className?: string;
  children: ReactNode;
}

export function WudaoChip({ className, size = "sm", variant = "soft", ...props }: WudaoChipProps) {
  return (
    <HeroChip
      className={cn("rounded-apple text-[10px] font-bold uppercase tracking-wide", className)}
      size={size}
      variant={variant}
      {...props}
    />
  );
}

export const WUDAO_FLOATING_PANEL_CLASS =
  "rounded-apple-xl border border-black/5 bg-white/90 p-1 shadow-apple-lg backdrop-blur-apple dark:border-white/10 dark:bg-black/80";

export const WUDAO_DROPDOWN_ITEM_CLASS =
  "flex min-h-0 w-full items-center gap-2 rounded-apple-lg px-3 py-2 text-xs font-semibold outline-none transition-colors data-[focused=true]:bg-black/5 dark:data-[focused=true]:bg-white/10";

export function WudaoDropdown(props: HeroDropdownProps) {
  return <HeroDropdown {...props} />;
}

export interface WudaoDropdownPopoverProps extends Omit<HeroDropdownPopoverProps, "className"> {
  className?: string;
}

export function WudaoDropdownPopover({
  className,
  offset = 6,
  placement = "bottom end",
  ...props
}: WudaoDropdownPopoverProps) {
  return (
    <HeroDropdown.Popover
      className={cn(WUDAO_FLOATING_PANEL_CLASS, className)}
      offset={offset}
      placement={placement}
      {...props}
    />
  );
}

export interface WudaoDropdownMenuProps<T extends object> extends Omit<HeroDropdownMenuProps<T>, "className"> {
  className?: string;
}

export function WudaoDropdownMenu<T extends object = object>({ className, ...props }: WudaoDropdownMenuProps<T>) {
  return (
    <HeroDropdown.Menu
      className={cn("flex min-w-0 flex-col gap-0.5 outline-none", className)}
      {...props}
    />
  );
}

export interface WudaoDropdownItemProps extends Omit<HeroDropdownItemProps, "className"> {
  className?: string;
  isSelected?: boolean;
}

export function WudaoDropdownItem({ className, isSelected, ...props }: WudaoDropdownItemProps) {
  return (
    <HeroDropdown.Item
      className={cn(
        WUDAO_DROPDOWN_ITEM_CLASS,
        isSelected
          ? "bg-apple-blue text-white shadow-apple-sm data-[focused=true]:bg-apple-blue/90 dark:data-[focused=true]:bg-apple-blue/80"
          : "text-system-gray-600 dark:text-system-gray-300",
        className,
      )}
      {...props}
    />
  );
}

export function WudaoDropdownItemIndicator(props: ComponentProps<typeof HeroDropdown.ItemIndicator>) {
  return <HeroDropdown.ItemIndicator {...props} />;
}

export function WudaoPopover(props: HeroPopoverProps) {
  return <HeroPopover {...props} />;
}

export interface WudaoPopoverContentProps extends Omit<HeroPopoverContentProps, "className" | "children"> {
  children: ReactNode;
  className?: string;
  dialogClassName?: string;
}

export function WudaoPopoverContent({
  children,
  className,
  dialogClassName,
  offset = 6,
  placement = "bottom end",
  ...props
}: WudaoPopoverContentProps) {
  return (
    <HeroPopover.Content
      className={cn(WUDAO_FLOATING_PANEL_CLASS, className)}
      offset={offset}
      placement={placement}
      {...props}
    >
      <HeroPopover.Dialog className={cn("outline-none", dialogClassName)}>
        {children}
      </HeroPopover.Dialog>
    </HeroPopover.Content>
  );
}

export interface WudaoModalProps extends Omit<HeroModalBackdropProps, "children" | "className"> {
  children: ReactNode;
  className?: string;
  containerClassName?: string;
  dialogClassName?: string;
  placement?: HeroModalContainerProps["placement"];
  scroll?: HeroModalContainerProps["scroll"];
  size?: HeroModalContainerProps["size"];
}

export function WudaoModal({
  children,
  className,
  containerClassName,
  dialogClassName,
  isDismissable = true,
  placement = "center",
  scroll = "inside",
  size = "md",
  variant = "blur",
  ...props
}: WudaoModalProps) {
  return (
    <HeroModal.Backdrop
      className={cn("bg-black/20 backdrop-blur-sm dark:bg-black/40", className)}
      isDismissable={isDismissable}
      variant={variant}
      {...props}
    >
      <HeroModal.Container
        className={containerClassName}
        placement={placement}
        scroll={scroll}
        size={size}
      >
        <HeroModal.Dialog
          className={cn(
            "overflow-hidden rounded-apple-2xl border border-black/5 bg-white shadow-apple-lg outline-none dark:border-white/10 dark:bg-background-dark-secondary",
            dialogClassName,
          )}
        >
          {children}
        </HeroModal.Dialog>
      </HeroModal.Container>
    </HeroModal.Backdrop>
  );
}

export function WudaoModalHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("apple-glass flex items-center justify-between border-b px-6 py-4", className)}
      {...props}
    />
  );
}

export function WudaoModalBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6", className)} {...props} />;
}

export function WudaoModalFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex justify-end gap-3 border-t border-black/5 bg-system-gray-50/50 p-6 dark:border-white/10 dark:bg-black/40", className)}
      {...props}
    />
  );
}

export function WudaoSpinner({ className, color = "accent", size = "md", ...props }: HeroSpinnerProps) {
  return (
    <HeroSpinner
      className={cn("text-apple-blue", className)}
      color={color}
      size={size}
      {...props}
    />
  );
}
