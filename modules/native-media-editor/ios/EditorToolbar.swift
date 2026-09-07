import UIKit

@MainActor
final class EditorToolbar: UIScrollView {
  var onAddText: (() -> Void)?
  var onEditText: (() -> Void)?
  var onColor: (() -> Void)?
  var onFont: (() -> Void)?
  var onBackground: (() -> Void)?
  var onOutline: (() -> Void)?
  var onLock: (() -> Void)?

  private let stack = UIStackView()
  private var lockButton: UIButton?

  override init(frame: CGRect) {
    super.init(frame: frame)
    showsHorizontalScrollIndicator = false
    alwaysBounceHorizontal = true
    backgroundColor = .clear
    stack.axis = .horizontal
    stack.alignment = .center
    stack.spacing = 10
    addSubview(stack)

    addButton("Aa+", action: #selector(addText))
    addButton("แก้", action: #selector(editText))
    addButton("● สี", action: #selector(color))
    addButton("Aa Font", action: #selector(font))
    addButton("◐ BG", action: #selector(background))
    addButton("◯ ขอบ", action: #selector(outline))
    lockButton = addButton("🔓 Lock", action: #selector(lock))
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    let size = stack.systemLayoutSizeFitting(
      CGSize(width: UIView.layoutFittingCompressedSize.width, height: 44)
    )
    stack.frame = CGRect(x: 12, y: 0, width: size.width, height: bounds.height)
    contentSize = CGSize(width: size.width + 24, height: bounds.height)
  }

  func setLocked(_ locked: Bool) {
    lockButton?.configuration?.title = locked ? "🔒 Lock" : "🔓 Lock"
    lockButton?.backgroundColor = locked
      ? UIColor(red: 0.996, green: 0.173, blue: 0.333, alpha: 0.72)
      : UIColor(white: 0, alpha: 0.58)
  }

  @discardableResult
  private func addButton(_ title: String, action: Selector) -> UIButton {
    let button = UIButton(type: .system)
    var configuration = UIButton.Configuration.plain()
    configuration.title = title
    configuration.baseForegroundColor = .white
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 10, bottom: 8, trailing: 10)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = .systemFont(ofSize: 13, weight: .bold)
      return outgoing
    }
    button.configuration = configuration
    button.backgroundColor = UIColor(white: 0, alpha: 0.58)
    button.layer.cornerRadius = 18
    button.addTarget(self, action: action, for: .touchUpInside)
    stack.addArrangedSubview(button)
    return button
  }

  @objc private func addText() { onAddText?() }
  @objc private func editText() { onEditText?() }
  @objc private func color() { onColor?() }
  @objc private func font() { onFont?() }
  @objc private func background() { onBackground?() }
  @objc private func outline() { onOutline?() }
  @objc private func lock() { onLock?() }
}
