import Foundation

@MainActor
final class EditorSession {
  let input: NativeEditorInput
  private(set) var overlays: [NativeOverlay]
  var selectedOverlayID: String?

  init(input: NativeEditorInput) {
    self.input = input
    self.overlays = input.overlays
  }

  var selectedOverlay: NativeOverlay? {
    guard let selectedOverlayID else { return nil }
    return overlays.first(where: { $0.id == selectedOverlayID })
  }

  func addTextOverlay(text: String) -> NativeOverlay {
    var overlay = NativeOverlay.newText(mediaId: input.mediaId)
    overlay.text = text
    overlays.append(overlay)
    selectedOverlayID = overlay.id
    return overlay
  }

  func update(_ overlay: NativeOverlay) {
    guard let index = overlays.firstIndex(where: { $0.id == overlay.id }) else { return }
    overlays[index] = overlay
  }

  func result(status: String) -> NativeEditorResult {
    NativeEditorResult(
      status: status,
      mediaId: input.mediaId,
      editedMediaURI: input.uri,
      overlays: overlays,
      crop: input.crop,
      duration: input.duration
    )
  }
}
