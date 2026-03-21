const MIN_CHAT_PANEL_WIDTH = 320;
const DRAWER_DIVIDER_WIDTH = 1;

const MIN_TERMINAL_WIDTH = 360;
const MIN_SDK_RUNNER_WIDTH = 280;
const MIN_ARTIFACTS_WIDTH = 200;

export const TERMINAL_DRAWER_WIDTH = 720;
export const SDK_RUNNER_DRAWER_WIDTH = 420;
export const ARTIFACTS_DRAWER_WIDTH = 440;

export interface RightDrawerLayout {
  terminalOpen: boolean;
  terminalWidth: number;
  sdkRunnerOpen: boolean;
  sdkRunnerWidth: number;
  artifactsOpen: boolean;
  artifactsWidth: number;
}

type DrawerKey = "terminal" | "sdkRunner" | "artifacts";

interface DrawerDragPreviewOptions {
  containerRight: number;
  pointerClientX: number;
  viewportWidth: number;
  layout: RightDrawerLayout;
}

const DRAWER_ORDER: DrawerKey[] = ["terminal", "sdkRunner", "artifacts"];

function getDrawerMinWidth(drawer: DrawerKey) {
  if (drawer === "terminal") return MIN_TERMINAL_WIDTH;
  if (drawer === "sdkRunner") return MIN_SDK_RUNNER_WIDTH;
  return MIN_ARTIFACTS_WIDTH;
}

function isDrawerOpen(layout: RightDrawerLayout, drawer: DrawerKey) {
  if (drawer === "terminal") return layout.terminalOpen;
  if (drawer === "sdkRunner") return layout.sdkRunnerOpen;
  return layout.artifactsOpen;
}

function getStoredDrawerWidth(layout: RightDrawerLayout, drawer: DrawerKey) {
  if (drawer === "terminal") return layout.terminalWidth;
  if (drawer === "sdkRunner") return layout.sdkRunnerWidth;
  return layout.artifactsWidth;
}

function getOpenDrawerCount(layout: RightDrawerLayout) {
  return Number(layout.terminalOpen) + Number(layout.sdkRunnerOpen) + Number(layout.artifactsOpen);
}

function getDrawerActualWidth(layout: RightDrawerLayout, drawer: DrawerKey) {
  if (!isDrawerOpen(layout, drawer)) return 0;
  return getStoredDrawerWidth(layout, drawer);
}

function getDrawerMinWidthsOnLeft(layout: RightDrawerLayout, drawer: DrawerKey) {
  if (drawer === "artifacts") {
    return (layout.terminalOpen ? MIN_TERMINAL_WIDTH : 0) + (layout.sdkRunnerOpen ? MIN_SDK_RUNNER_WIDTH : 0);
  }
  if (drawer === "sdkRunner") {
    return layout.terminalOpen ? MIN_TERMINAL_WIDTH : 0;
  }
  return 0;
}

function getAvailableDrawerWidthBudget(layout: RightDrawerLayout, viewportWidth: number) {
  return viewportWidth - MIN_CHAT_PANEL_WIDTH - getOpenDrawerCount(layout) * DRAWER_DIVIDER_WIDTH;
}

function getReservedRightWidth(
  layout: RightDrawerLayout,
  drawer: DrawerKey,
) {
  const drawerIndex = DRAWER_ORDER.indexOf(drawer);
  let width = 0;

  for (let index = drawerIndex + 1; index < DRAWER_ORDER.length; index += 1) {
    const key = DRAWER_ORDER[index];
    if (!isDrawerOpen(layout, key)) continue;
    width += getStoredDrawerWidth(layout, key) + DRAWER_DIVIDER_WIDTH;
  }

  return width;
}

function clampDrawerWidth(
  drawer: DrawerKey,
  rawWidth: number,
  maxWidth: number,
) {
  return Math.min(
    Math.max(rawWidth, getDrawerMinWidth(drawer)),
    Math.max(getDrawerMinWidth(drawer), maxWidth),
  );
}

export function resolveRightDrawerLayout(
  layout: RightDrawerLayout,
  viewportWidth: number,
) {
  const availableWidthBudget = getAvailableDrawerWidthBudget(layout, viewportWidth);
  const artifactsWidth = layout.artifactsOpen
    ? clampDrawerWidth(
        "artifacts",
        layout.artifactsWidth,
        availableWidthBudget - getDrawerMinWidthsOnLeft(layout, "artifacts"),
      )
    : 0;

  const sdkRunnerWidth = layout.sdkRunnerOpen
    ? clampDrawerWidth(
        "sdkRunner",
        layout.sdkRunnerWidth,
        availableWidthBudget - getDrawerMinWidthsOnLeft(layout, "sdkRunner") - artifactsWidth,
      )
    : 0;

  const terminalWidth = layout.terminalOpen
    ? clampDrawerWidth(
        "terminal",
        layout.terminalWidth,
        availableWidthBudget - sdkRunnerWidth - artifactsWidth,
      )
    : 0;

  const totalWidth =
    (layout.terminalOpen ? terminalWidth + DRAWER_DIVIDER_WIDTH : 0) +
    (layout.sdkRunnerOpen ? sdkRunnerWidth + DRAWER_DIVIDER_WIDTH : 0) +
    (layout.artifactsOpen ? artifactsWidth + DRAWER_DIVIDER_WIDTH : 0);

  return {
    terminalWidth,
    sdkRunnerWidth,
    artifactsWidth,
    totalWidth,
    chatPanelWidth: getOpenDrawerCount(layout) > 0 ? `calc(100% - ${totalWidth}px)` : "100%",
  };
}

export function clampTerminalWidth(
  rawWidth: number,
  viewportWidth: number,
  options: Pick<RightDrawerLayout, "sdkRunnerOpen" | "sdkRunnerWidth" | "artifactsOpen" | "artifactsWidth">,
) {
  const resolved = resolveRightDrawerLayout(
    {
      terminalOpen: true,
      terminalWidth: rawWidth,
      sdkRunnerOpen: options.sdkRunnerOpen,
      sdkRunnerWidth: options.sdkRunnerWidth,
      artifactsOpen: options.artifactsOpen,
      artifactsWidth: options.artifactsWidth,
    },
    viewportWidth,
  );
  return resolved.terminalWidth;
}

export function clampSdkRunnerWidth(
  rawWidth: number,
  viewportWidth: number,
  options: Pick<RightDrawerLayout, "artifactsOpen" | "artifactsWidth">,
) {
  const resolved = resolveRightDrawerLayout(
    {
      terminalOpen: false,
      terminalWidth: TERMINAL_DRAWER_WIDTH,
      sdkRunnerOpen: true,
      sdkRunnerWidth: rawWidth,
      artifactsOpen: options.artifactsOpen,
      artifactsWidth: options.artifactsWidth,
    },
    viewportWidth,
  );
  return resolved.sdkRunnerWidth;
}

export function clampArtifactsWidth(
  rawWidth: number,
  viewportWidth: number,
  options: Pick<RightDrawerLayout, "terminalOpen" | "terminalWidth" | "sdkRunnerOpen" | "sdkRunnerWidth"> = {
    terminalOpen: false,
    terminalWidth: TERMINAL_DRAWER_WIDTH,
    sdkRunnerOpen: false,
    sdkRunnerWidth: SDK_RUNNER_DRAWER_WIDTH,
  },
) {
  return resolveRightDrawerLayout(
    {
      terminalOpen: options.terminalOpen,
      terminalWidth: options.terminalWidth,
      sdkRunnerOpen: options.sdkRunnerOpen,
      sdkRunnerWidth: options.sdkRunnerWidth,
      artifactsOpen: true,
      artifactsWidth: rawWidth,
    },
    viewportWidth,
  ).artifactsWidth;
}

export function getCollapsedChatPanelWidth(layout: RightDrawerLayout) {
  const totalWidth =
    (layout.terminalOpen ? layout.terminalWidth + DRAWER_DIVIDER_WIDTH : 0) +
    (layout.sdkRunnerOpen ? layout.sdkRunnerWidth + DRAWER_DIVIDER_WIDTH : 0) +
    (layout.artifactsOpen ? layout.artifactsWidth + DRAWER_DIVIDER_WIDTH : 0);

  return totalWidth > 0 ? `calc(100% - ${totalWidth}px)` : "100%";
}

function getDrawerRightBoundary(
  drawer: DrawerKey,
  containerRight: number,
  layout: RightDrawerLayout,
) {
  return containerRight - getReservedRightWidth(layout, drawer);
}

function getDrawerDragPreview(
  drawer: DrawerKey,
  {
    containerRight,
    pointerClientX,
    viewportWidth,
    layout,
  }: DrawerDragPreviewOptions,
) {
  const resolved = resolveRightDrawerLayout(layout, viewportWidth);
  const resolvedLayout: RightDrawerLayout = {
    terminalOpen: layout.terminalOpen,
    terminalWidth: resolved.terminalWidth,
    sdkRunnerOpen: layout.sdkRunnerOpen,
    sdkRunnerWidth: resolved.sdkRunnerWidth,
    artifactsOpen: layout.artifactsOpen,
    artifactsWidth: resolved.artifactsWidth,
  };
  const rightBoundary = getDrawerRightBoundary(drawer, containerRight, resolvedLayout);
  const availableWidthBudget =
    getAvailableDrawerWidthBudget(resolvedLayout, viewportWidth) -
    (getDrawerActualWidth(resolvedLayout, "terminal") * Number(drawer !== "terminal")) -
    (getDrawerActualWidth(resolvedLayout, "sdkRunner") * Number(drawer !== "sdkRunner")) -
    (getDrawerActualWidth(resolvedLayout, "artifacts") * Number(drawer !== "artifacts"));
  const width = clampDrawerWidth(
    drawer,
    rightBoundary - pointerClientX,
    availableWidthBudget,
  );

  const nextLayout: RightDrawerLayout = {
    ...resolvedLayout,
    ...(drawer === "terminal" ? { terminalWidth: width } : {}),
    ...(drawer === "sdkRunner" ? { sdkRunnerWidth: width } : {}),
    ...(drawer === "artifacts" ? { artifactsWidth: width } : {}),
  };

  return {
    width,
    chatPanelWidth: resolveRightDrawerLayout(nextLayout, viewportWidth).chatPanelWidth,
  };
}

export function getTerminalDragPreview(options: DrawerDragPreviewOptions) {
  const result = getDrawerDragPreview("terminal", options);
  return {
    terminalWidth: result.width,
    chatPanelWidth: result.chatPanelWidth,
  };
}

export function getSdkRunnerDragPreview(options: DrawerDragPreviewOptions) {
  const result = getDrawerDragPreview("sdkRunner", options);
  return {
    sdkRunnerWidth: result.width,
    chatPanelWidth: result.chatPanelWidth,
  };
}

export function getArtifactsDragPreview(options: DrawerDragPreviewOptions) {
  const result = getDrawerDragPreview("artifacts", options);
  return {
    artifactsWidth: result.width,
    chatPanelWidth: result.chatPanelWidth,
  };
}
