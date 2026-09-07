import CoreGraphics

/// Phase 5 boundary. Kept independent so guide/snap never becomes a second
/// transform writer. GestureCoordinator will ask this engine for a position.
struct AlignmentGuideEngine {
  struct Result {
    let position: CGPoint
    let verticalGuide: CGFloat?
    let horizontalGuide: CGFloat?
  }

  func resolve(position: CGPoint) -> Result {
    Result(position: position, verticalGuide: nil, horizontalGuide: nil)
  }
}
