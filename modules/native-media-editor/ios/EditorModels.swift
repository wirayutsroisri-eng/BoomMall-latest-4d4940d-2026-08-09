import Foundation
import CoreGraphics

struct NativeEditorInput: Codable {
  let mediaId: String
  let uri: String
  let mediaType: String
  var overlays: [NativeOverlay]
  let crop: NativeCropMetadata?
  let duration: Double?
}

struct NativeEditorResult: Codable {
  let status: String
  let mediaId: String
  let editedMediaURI: String
  let overlays: [NativeOverlay]
  let crop: NativeCropMetadata?
  let duration: Double?
}

struct NativeCropMetadata: Codable {
  var x: Double?
  var y: Double?
  var width: Double?
  var height: Double?
  var rotation: Double?
}

struct NativeOverlay: Codable, Identifiable {
  var id: String
  var mediaId: String
  var type: String
  var text: String?
  var sticker: String?
  var locked: Bool?
  var transform: NativeOverlayTransform
  var style: NativeTextStyle?
}

struct NativeOverlayTransform: Codable {
  var x: Double
  var y: Double
  var scale: Double
  var rotation: Double
}

struct NativeTextStyle: Codable {
  var color: String?
  var fontKey: String?
  var fontFamily: String?
  var fontSize: Double?
  var fontWeight: String?
  var fontStyle: String?
  var letterSpacing: Double?
  var preset: String?
  var backgroundColor: String?
  var backgroundOpacity: Double?
  var strokeColor: String?
  var strokeWidth: Double?
  var alignment: String?
  var opacity: Double?

  static let newText = NativeTextStyle(
    color: "#FFFFFF",
    fontKey: "classic",
    fontFamily: nil,
    fontSize: 36.0 / 390.0,
    fontWeight: "700",
    fontStyle: "normal",
    letterSpacing: 0,
    preset: "default",
    backgroundColor: "transparent",
    backgroundOpacity: 0,
    strokeColor: "transparent",
    strokeWidth: 0,
    alignment: "center",
    opacity: nil
  )
}

extension NativeOverlay {
  static func newText(mediaId: String) -> NativeOverlay {
    NativeOverlay(
      id: "native-text-\(UUID().uuidString.lowercased())",
      mediaId: mediaId,
      type: "text",
      text: "",
      sticker: nil,
      locked: false,
      transform: NativeOverlayTransform(x: 0.5, y: 0.38, scale: 1, rotation: 0),
      style: .newText
    )
  }
}
