const MIN_ARTIFACTS_WIDTH = 200;
const ARTIFACTS_RESIZER_WIDTH = 1;

interface ArtifactsDragPreviewOptions {
  containerRight: number;
  pointerClientX: number;
  terminalCollapsed: boolean;
  viewportWidth: number;
}

export function clampArtifactsWidth(rawWidth: number, viewportWidth: number) {
  return Math.min(Math.max(rawWidth, MIN_ARTIFACTS_WIDTH), viewportWidth * 0.8);
}

export function getCollapsedChatPanelWidth(artifactsWidth: number) {
  return `calc(100% - ${artifactsWidth + ARTIFACTS_RESIZER_WIDTH}px)`;
}

export function getArtifactsDragPreview({
  containerRight,
  pointerClientX,
  terminalCollapsed,
  viewportWidth,
}: ArtifactsDragPreviewOptions) {
  const artifactsWidth = clampArtifactsWidth(containerRight - pointerClientX, viewportWidth);

  return {
    artifactsWidth,
    chatPanelWidth: terminalCollapsed ? getCollapsedChatPanelWidth(artifactsWidth) : null,
  };
}
