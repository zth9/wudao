export interface TerminalPixelSize {
  width: number;
  height: number;
}

export interface TerminalCellSize {
  cols: number;
  rows: number;
}

const MIN_TERMINAL_PIXEL_WIDTH = 120;
const MIN_TERMINAL_PIXEL_HEIGHT = 80;

export function isRenderableTerminalViewport(size: TerminalPixelSize) {
  return (
    Number.isFinite(size.width)
    && Number.isFinite(size.height)
    && size.width >= MIN_TERMINAL_PIXEL_WIDTH
    && size.height >= MIN_TERMINAL_PIXEL_HEIGHT
  );
}

export function shouldSyncTerminalSize(next: TerminalCellSize, previous: TerminalCellSize | null) {
  if (!Number.isFinite(next.cols) || !Number.isFinite(next.rows)) {
    return false;
  }
  if (next.cols <= 0 || next.rows <= 0) {
    return false;
  }
  if (!previous) {
    return true;
  }
  return next.cols !== previous.cols || next.rows !== previous.rows;
}
