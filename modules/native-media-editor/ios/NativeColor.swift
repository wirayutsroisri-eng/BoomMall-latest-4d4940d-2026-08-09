import UIKit

extension UIColor {
  convenience init(nativeHex value: String?, fallback: UIColor = .white) {
    guard var raw = value?.trimmingCharacters(in: .whitespacesAndNewlines) else {
      self.init(cgColor: fallback.cgColor)
      return
    }
    guard raw.lowercased() != "transparent" else {
      self.init(cgColor: UIColor.clear.cgColor)
      return
    }
    raw = raw.replacingOccurrences(of: "#", with: "")
    guard raw.count == 6, let number = Int(raw, radix: 16) else {
      self.init(cgColor: fallback.cgColor)
      return
    }
    self.init(
      red: CGFloat((number >> 16) & 0xff) / 255,
      green: CGFloat((number >> 8) & 0xff) / 255,
      blue: CGFloat(number & 0xff) / 255,
      alpha: 1
    )
  }
}
