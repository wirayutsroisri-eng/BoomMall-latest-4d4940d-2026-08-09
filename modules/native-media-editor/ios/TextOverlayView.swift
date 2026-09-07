import UIKit

@MainActor
final class TextOverlayView: UIView {
  private let label = UILabel()
  private(set) var overlay: NativeOverlay

  init(overlay: NativeOverlay) {
    self.overlay = overlay
    super.init(frame: .zero)
    isUserInteractionEnabled = false
    backgroundColor = .clear
    label.numberOfLines = 0
    label.textAlignment = .center
    addSubview(label)
    applyPresentation()
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    label.frame = bounds
  }

  func replace(with overlay: NativeOverlay, canvasBounds: CGRect) {
    let stableCenter = center
    self.overlay = overlay
    applyPresentation()
    center = stableCenter
    applyTransform()
    if stableCenter == .zero { applyNormalizedPosition(in: canvasBounds) }
  }

  func applyNormalizedPosition(in bounds: CGRect) {
    center = CGPoint(
      x: bounds.width * CGFloat(overlay.transform.x),
      y: bounds.height * CGFloat(overlay.transform.y)
    )
    applyTransform()
  }

  func commitTransform(in bounds: CGRect, center: CGPoint, scale: CGFloat, rotation: CGFloat) -> NativeOverlay {
    var next = overlay
    next.transform = NativeOverlayTransform(
      x: Double(bounds.width > 0 ? center.x / bounds.width : 0.5),
      y: Double(bounds.height > 0 ? center.y / bounds.height : 0.5),
      scale: Double(scale),
      rotation: Double(rotation)
    )
    overlay = next
    return next
  }

  func actualTextContains(_ canvasPoint: CGPoint, from canvas: UIView, tolerance: CGFloat = 6) -> Bool {
    let local = convert(canvasPoint, from: canvas)
    return bounds.insetBy(dx: -tolerance, dy: -tolerance).contains(local)
  }

  func multiTouchZoneContains(_ canvasPoint: CGPoint, from canvas: UIView) -> Bool {
    let local = convert(canvasPoint, from: canvas)
    return bounds.insetBy(dx: -8, dy: -120).contains(local)
  }

  private func applyPresentation() {
    let style = overlay.style ?? .newText
    let text = overlay.text ?? ""
    let fontSize = max(14, CGFloat(style.fontSize ?? (36.0 / 390.0)) * 390)
    let font: UIFont
    switch style.preset {
    case "bold", "display": font = .systemFont(ofSize: fontSize, weight: .black)
    case "soft": font = .roundedSystemFont(ofSize: fontSize, weight: .medium)
    default: font = .systemFont(ofSize: fontSize, weight: style.fontWeight == "900" ? .black : .bold)
    }

    let foreground = UIColor(nativeHex: style.color, fallback: .white)
    let strokeWidth = CGFloat(style.strokeWidth ?? 0)
    let strokeColor = UIColor(nativeHex: style.strokeColor, fallback: .clear)
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = .center
    let attributes: [NSAttributedString.Key: Any] = [
      .font: font,
      .foregroundColor: foreground,
      .strokeColor: strokeColor,
      .strokeWidth: strokeWidth > 0 ? -strokeWidth : 0,
      .paragraphStyle: paragraph,
      .kern: style.letterSpacing ?? 0
    ]
    label.attributedText = NSAttributedString(string: text, attributes: attributes)
    let fitted = label.sizeThatFits(CGSize(width: 300, height: 500))
    bounds.size = CGSize(width: max(24, fitted.width + 20), height: max(36, fitted.height + 8))

    let opacity = CGFloat(style.backgroundOpacity ?? 0)
    backgroundColor = opacity > 0
      ? UIColor(nativeHex: style.backgroundColor, fallback: .black).withAlphaComponent(opacity)
      : .clear
    layer.cornerRadius = 8
  }

  private func applyTransform() {
    transform = CGAffineTransform(rotationAngle: CGFloat(overlay.transform.rotation))
      .scaledBy(x: CGFloat(overlay.transform.scale), y: CGFloat(overlay.transform.scale))
  }
}

private extension UIFont {
  static func roundedSystemFont(ofSize size: CGFloat, weight: UIFont.Weight) -> UIFont {
    let base = UIFont.systemFont(ofSize: size, weight: weight)
    guard let descriptor = base.fontDescriptor.withDesign(.rounded) else { return base }
    return UIFont(descriptor: descriptor, size: size)
  }
}
