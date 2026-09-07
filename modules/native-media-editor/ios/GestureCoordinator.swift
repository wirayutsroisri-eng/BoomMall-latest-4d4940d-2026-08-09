import UIKit

@MainActor
final class GestureCoordinator: UIGestureRecognizer {
  var overlayViews: () -> [TextOverlayView] = { [] }
  var selectedOverlayID: () -> String? = { nil }
  var onSelect: (TextOverlayView) -> Void = { _ in }
  var onCommit: (TextOverlayView, CGPoint, CGFloat, CGFloat) -> Void = { _, _, _, _ in }

  private weak var canvas: UIView?
  private var points: [ObjectIdentifier: CGPoint] = [:]
  private var touchOrder: [ObjectIdentifier] = []
  private weak var activeOverlay: TextOverlayView?
  private var sessionActive = false
  private var startCenter = CGPoint.zero
  private var startCentroid = CGPoint.zero
  private var startDistance: CGFloat = 1
  private var startAngle: CGFloat = 0
  private var startVector = CGPoint.zero
  private var startScale: CGFloat = 1
  private var startRotation: CGFloat = 0
  private var currentScale: CGFloat = 1
  private var currentRotation: CGFloat = 0

  init(canvas: UIView) {
    self.canvas = canvas
    super.init(target: nil, action: nil)
    cancelsTouchesInView = false
    delaysTouchesBegan = false
    delaysTouchesEnded = false
  }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let canvas else { state = .failed; return }
    for touch in touches {
      let id = ObjectIdentifier(touch)
      if points[id] == nil { touchOrder.append(id) }
      points[id] = touch.location(in: canvas)
    }

    let locations = orderedLocations()
    if locations.count == 1, let point = locations.first {
      activeOverlay = bestOneFingerOverlay(at: point, canvas: canvas)
      if let activeOverlay {
        initializeTransform(from: activeOverlay)
        rebaseOne(at: point)
        onSelect(activeOverlay)
      }
    } else if locations.count >= 2 {
      let first = locations[0]
      let second = locations[1]
      if activeOverlay == nil {
        activeOverlay = bestTwoFingerOverlay(first: first, second: second, canvas: canvas)
      }
      guard let activeOverlay, activeOverlay.overlay.locked != true else {
        state = .failed
        return
      }
      initializeTransform(from: activeOverlay)
      rebaseTwo(first: first, second: second)
      sessionActive = true
      state = .began
      onSelect(activeOverlay)
    }
  }

  override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
    guard let canvas, let activeOverlay, activeOverlay.overlay.locked != true else { return }
    for touch in touches {
      points[ObjectIdentifier(touch)] = touch.location(in: canvas)
    }
    let locations = orderedLocations()

    if locations.count >= 2 {
      let first = locations[0]
      let second = locations[1]
      if !sessionActive {
        initializeTransform(from: activeOverlay)
        rebaseTwo(first: first, second: second)
        sessionActive = true
        state = .began
      }
      applyTwo(first: first, second: second, to: activeOverlay)
      state = .changed
      return
    }

    guard let point = locations.first else { return }
    if !sessionActive {
      let movement = hypot(point.x - startCentroid.x, point.y - startCentroid.y)
      guard movement >= 4 else { return }
      sessionActive = true
      state = .began
    }
    activeOverlay.center = CGPoint(
      x: startCenter.x + point.x - startCentroid.x,
      y: startCenter.y + point.y - startCentroid.y
    )
    state = .changed
  }

  override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
    for touch in touches {
      let id = ObjectIdentifier(touch)
      points.removeValue(forKey: id)
      touchOrder.removeAll { $0 == id }
    }
    let remaining = orderedLocations()
    if remaining.count >= 2 {
      rebaseTwo(first: remaining[0], second: remaining[1])
      return
    }
    if let point = remaining.first {
      rebaseOne(at: point)
      return
    }
    finish(cancelled: false)
  }

  override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
    points.removeAll()
    touchOrder.removeAll()
    finish(cancelled: true)
  }

  override func reset() {
    super.reset()
    points.removeAll()
    touchOrder.removeAll()
    activeOverlay = nil
    sessionActive = false
  }

  private func finish(cancelled: Bool) {
    if sessionActive, let activeOverlay {
      onCommit(activeOverlay, activeOverlay.center, currentScale, currentRotation)
      state = cancelled ? .cancelled : .ended
    } else {
      state = .failed
    }
  }

  private func orderedLocations() -> [CGPoint] {
    touchOrder.compactMap { points[$0] }
  }

  private func initializeTransform(from overlay: TextOverlayView) {
    currentScale = CGFloat(overlay.overlay.transform.scale)
    currentRotation = CGFloat(overlay.overlay.transform.rotation)
  }

  private func rebaseOne(at point: CGPoint) {
    guard let activeOverlay else { return }
    startCenter = activeOverlay.center
    startCentroid = point
    startScale = currentScale
    startRotation = currentRotation
  }

  private func rebaseTwo(first: CGPoint, second: CGPoint) {
    guard let activeOverlay else { return }
    startCenter = activeOverlay.center
    startCentroid = CGPoint(x: (first.x + second.x) / 2, y: (first.y + second.y) / 2)
    startDistance = max(1, hypot(second.x - first.x, second.y - first.y))
    startAngle = atan2(second.y - first.y, second.x - first.x)
    startVector = CGPoint(x: startCenter.x - startCentroid.x, y: startCenter.y - startCentroid.y)
    startScale = currentScale
    startRotation = currentRotation
  }

  private func applyTwo(first: CGPoint, second: CGPoint, to overlay: TextOverlayView) {
    let centroid = CGPoint(x: (first.x + second.x) / 2, y: (first.y + second.y) / 2)
    let distance = max(1, hypot(second.x - first.x, second.y - first.y))
    let angle = atan2(second.y - first.y, second.x - first.x)
    let ratio = distance / startDistance
    let angleDelta = atan2(sin(angle - startAngle), cos(angle - startAngle))
    currentScale = min(4, max(0.4, startScale * ratio))
    currentRotation = startRotation + angleDelta
    let appliedRatio = currentScale / max(0.001, startScale)
    let cosine = cos(angleDelta)
    let sine = sin(angleDelta)
    let vector = CGPoint(
      x: (startVector.x * cosine - startVector.y * sine) * appliedRatio,
      y: (startVector.x * sine + startVector.y * cosine) * appliedRatio
    )
    overlay.center = CGPoint(x: centroid.x + vector.x, y: centroid.y + vector.y)
    overlay.transform = CGAffineTransform(rotationAngle: currentRotation)
      .scaledBy(x: currentScale, y: currentScale)
  }

  private func bestOneFingerOverlay(at point: CGPoint, canvas: UIView) -> TextOverlayView? {
    let selected = selectedOverlayID()
    return overlayViews()
      .filter { $0.overlay.locked != true && $0.actualTextContains(point, from: canvas) }
      .sorted { lhs, rhs in
        if lhs.overlay.id == selected { return true }
        if rhs.overlay.id == selected { return false }
        return hypot(lhs.center.x - point.x, lhs.center.y - point.y)
          < hypot(rhs.center.x - point.x, rhs.center.y - point.y)
      }
      .first
  }

  private func bestTwoFingerOverlay(first: CGPoint, second: CGPoint, canvas: UIView) -> TextOverlayView? {
    let centroid = CGPoint(x: (first.x + second.x) / 2, y: (first.y + second.y) / 2)
    let selected = selectedOverlayID()
    return overlayViews()
      .filter {
        $0.overlay.locked != true
          && $0.multiTouchZoneContains(first, from: canvas)
          && $0.multiTouchZoneContains(second, from: canvas)
      }
      .sorted { lhs, rhs in
        if lhs.overlay.id == selected { return true }
        if rhs.overlay.id == selected { return false }
        return hypot(lhs.center.x - centroid.x, lhs.center.y - centroid.y)
          < hypot(rhs.center.x - centroid.x, rhs.center.y - centroid.y)
      }
      .first
  }
}
