import UIKit

@MainActor
final class NativeMediaEditorViewController: UIViewController, UIGestureRecognizerDelegate {
  var onComplete: ((NativeEditorResult) -> Void)?

  private let session: EditorSession
  private let canvas: MediaCanvas
  private let toolbar = EditorToolbar()
  private var overlayViews: [String: TextOverlayView] = [:]
  private var gestureCoordinator: GestureCoordinator!
  private var didLayOutOverlays = false
  private let colors = ["#FFFFFF", "#111111", "#FE2C55", "#FFD60A", "#34C759", "#25F4EE", "#0A84FF", "#AF52DE", "#FF6BBA"]

  init(input: NativeEditorInput) {
    session = EditorSession(input: input)
    canvas = MediaCanvas(input: input)
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .fullScreen
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    configureChrome()
    configureCanvas()
    configureToolbar()
    installExistingOverlays()
    configureGestureCoordinator()
    configureDragDownDismiss()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard !didLayOutOverlays, canvas.bounds.width > 0, canvas.bounds.height > 0 else { return }
    didLayOutOverlays = true
    overlayViews.values.forEach { $0.applyNormalizedPosition(in: canvas.bounds) }
  }

  private func configureChrome() {
    let cancel = makeChromeButton(title: "ยกเลิก", action: #selector(cancelEditor))
    let done = makeChromeButton(title: "เสร็จสิ้น", action: #selector(doneEditor))
    view.addSubview(cancel)
    view.addSubview(done)
    cancel.translatesAutoresizingMaskIntoConstraints = false
    done.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      cancel.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      cancel.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      done.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      done.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8)
    ])
  }

  private func configureCanvas() {
    view.insertSubview(canvas, at: 0)
    canvas.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      canvas.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      canvas.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      canvas.topAnchor.constraint(equalTo: view.topAnchor),
      canvas.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    ])
  }

  private func configureToolbar() {
    view.addSubview(toolbar)
    toolbar.translatesAutoresizingMaskIntoConstraints = false
    NSLayoutConstraint.activate([
      toolbar.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
      toolbar.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
      toolbar.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),
      toolbar.heightAnchor.constraint(equalToConstant: 48)
    ])
    toolbar.onAddText = { [weak self] in self?.promptForNewText() }
    toolbar.onEditText = { [weak self] in self?.promptToEditSelectedText() }
    toolbar.onColor = { [weak self] in self?.cycleColor() }
    toolbar.onFont = { [weak self] in self?.cycleFont() }
    toolbar.onBackground = { [weak self] in self?.cycleBackground() }
    toolbar.onOutline = { [weak self] in self?.toggleOutline() }
    toolbar.onLock = { [weak self] in self?.toggleLock() }
  }

  private func configureGestureCoordinator() {
    gestureCoordinator = GestureCoordinator(canvas: canvas)
    gestureCoordinator.overlayViews = { [weak self] in
      guard let self else { return [] }
      return Array(self.overlayViews.values)
    }
    gestureCoordinator.selectedOverlayID = { [weak self] in self?.session.selectedOverlayID }
    gestureCoordinator.onSelect = { [weak self] view in self?.select(view.overlay.id) }
    gestureCoordinator.onCommit = { [weak self] view, center, scale, rotation in
      guard let self else { return }
      let overlay = view.commitTransform(
        in: self.canvas.bounds,
        center: center,
        scale: scale,
        rotation: rotation
      )
      self.session.update(overlay)
    }
    canvas.addGestureRecognizer(gestureCoordinator)
  }

  private func configureDragDownDismiss() {
    let pan = UIPanGestureRecognizer(target: self, action: #selector(handleDragDown(_:)))
    pan.delegate = self
    pan.cancelsTouchesInView = false
    view.addGestureRecognizer(pan)
  }

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard let pan = gestureRecognizer as? UIPanGestureRecognizer else { return true }
    let velocity = pan.velocity(in: view)
    let start = pan.location(in: view)
    return start.y <= view.safeAreaInsets.top + 64 && velocity.y > abs(velocity.x)
  }

  @objc private func handleDragDown(_ pan: UIPanGestureRecognizer) {
    let translation = max(0, pan.translation(in: view).y)
    switch pan.state {
    case .changed:
      view.transform = CGAffineTransform(translationX: 0, y: translation)
    case .ended:
      let shouldDismiss = translation > 120 || pan.velocity(in: view).y > 900
      if shouldDismiss {
        UIView.animate(withDuration: 0.18, delay: 0, options: .curveEaseIn) {
          self.view.transform = CGAffineTransform(translationX: 0, y: self.view.bounds.height)
        } completion: { _ in
          self.finish(status: "cancel", animated: false)
        }
      } else {
        UIView.animate(
          withDuration: 0.32,
          delay: 0,
          usingSpringWithDamping: 0.86,
          initialSpringVelocity: 0,
          options: [.curveEaseOut, .allowUserInteraction]
        ) { self.view.transform = .identity }
      }
    case .cancelled, .failed:
      UIView.animate(withDuration: 0.2) { self.view.transform = .identity }
    default:
      break
    }
  }

  private func installExistingOverlays() {
    session.overlays.filter { $0.type == "text" && !($0.text ?? "").isEmpty }.forEach(install)
  }

  private func install(_ overlay: NativeOverlay) {
    let overlayView = TextOverlayView(overlay: overlay)
    overlayViews[overlay.id] = overlayView
    canvas.addSubview(overlayView)
    if canvas.bounds.width > 0 { overlayView.applyNormalizedPosition(in: canvas.bounds) }
  }

  private func select(_ id: String) {
    session.selectedOverlayID = id
    toolbar.setLocked(session.selectedOverlay?.locked == true)
  }

  private func mutateSelected(_ change: (inout NativeOverlay) -> Void) {
    guard var overlay = session.selectedOverlay, let overlayView = overlayViews[overlay.id] else { return }
    change(&overlay)
    session.update(overlay)
    overlayView.replace(with: overlay, canvasBounds: canvas.bounds)
    toolbar.setLocked(overlay.locked == true)
  }

  private func promptForNewText() {
    prompt(title: "เพิ่มข้อความ", initial: "") { [weak self] text in
      guard let self, !text.isEmpty else { return }
      let overlay = self.session.addTextOverlay(text: text)
      self.install(overlay)
      self.select(overlay.id)
    }
  }

  private func promptToEditSelectedText() {
    guard let overlay = session.selectedOverlay, overlay.locked != true else { return }
    prompt(title: "แก้ไขข้อความ", initial: overlay.text ?? "") { [weak self] text in
      self?.mutateSelected { $0.text = text }
    }
  }

  private func prompt(title: String, initial: String, completion: @escaping (String) -> Void) {
    let alert = UIAlertController(title: title, message: nil, preferredStyle: .alert)
    alert.addTextField { field in
      field.text = initial
      field.clearButtonMode = .whileEditing
    }
    alert.addAction(UIAlertAction(title: "ยกเลิก", style: .cancel))
    alert.addAction(UIAlertAction(title: "เสร็จสิ้น", style: .default) { _ in
      completion(alert.textFields?.first?.text ?? "")
    })
    present(alert, animated: true)
  }

  private func cycleColor() {
    mutateSelected { overlay in
      var style = overlay.style ?? .newText
      let index = colors.firstIndex(of: style.color ?? "#FFFFFF") ?? -1
      style.color = colors[(index + 1) % colors.count]
      overlay.style = style
    }
  }

  private func cycleFont() {
    let presets = ["default", "bold", "soft", "display"]
    mutateSelected { overlay in
      var style = overlay.style ?? .newText
      let index = presets.firstIndex(of: style.preset ?? "default") ?? -1
      style.preset = presets[(index + 1) % presets.count]
      overlay.style = style
    }
  }

  private func cycleBackground() {
    let opacities = [0.0, 0.25, 0.5, 0.75, 1.0]
    mutateSelected { overlay in
      var style = overlay.style ?? .newText
      let index = opacities.firstIndex(of: style.backgroundOpacity ?? 0) ?? -1
      style.backgroundColor = "#000000"
      style.backgroundOpacity = opacities[(index + 1) % opacities.count]
      overlay.style = style
    }
  }

  private func toggleOutline() {
    mutateSelected { overlay in
      var style = overlay.style ?? .newText
      let enabled = (style.strokeWidth ?? 0) > 0
      style.strokeColor = enabled ? "transparent" : "#000000"
      style.strokeWidth = enabled ? 0 : 2
      overlay.style = style
    }
  }

  private func toggleLock() {
    mutateSelected { $0.locked = !($0.locked ?? false) }
  }

  private func makeChromeButton(title: String, action: Selector) -> UIButton {
    let button = UIButton(type: .system)
    var configuration = UIButton.Configuration.plain()
    configuration.title = title
    configuration.baseForegroundColor = .white
    configuration.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12)
    configuration.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
      var outgoing = incoming
      outgoing.font = .systemFont(ofSize: 15, weight: .bold)
      return outgoing
    }
    button.configuration = configuration
    button.backgroundColor = UIColor(white: 0, alpha: 0.58)
    button.layer.cornerRadius = 18
    button.addTarget(self, action: action, for: .touchUpInside)
    return button
  }

  @objc private func cancelEditor() { finish(status: "cancel") }
  @objc private func doneEditor() { finish(status: "done") }

  private func finish(status: String, animated: Bool = true) {
    let result = session.result(status: status)
    let completion = onComplete
    dismiss(animated: animated) { completion?(result) }
  }
}
