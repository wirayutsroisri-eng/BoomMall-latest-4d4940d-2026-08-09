import UIKit
import AVFoundation

@MainActor
final class MediaCanvas: UIView {
  private let imageView = UIImageView()
  private var player: AVPlayer?
  private var playerLayer: AVPlayerLayer?

  init(input: NativeEditorInput) {
    super.init(frame: .zero)
    clipsToBounds = true
    backgroundColor = .black
    isMultipleTouchEnabled = true

    if input.mediaType == "video" {
      configureVideo(uri: input.uri)
    } else {
      configureImage(uri: input.uri)
    }
  }

  required init?(coder: NSCoder) {
    fatalError("init(coder:) has not been implemented")
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    imageView.frame = bounds
    playerLayer?.frame = bounds
  }

  private func configureImage(uri: String) {
    imageView.frame = bounds
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    imageView.contentMode = .scaleAspectFit
    if let url = Self.url(from: uri), url.isFileURL {
      imageView.image = UIImage(contentsOfFile: url.path)
    } else if let url = Self.url(from: uri) {
      URLSession.shared.dataTask(with: url) { [weak imageView] data, _, _ in
        guard let data, let image = UIImage(data: data) else { return }
        DispatchQueue.main.async { imageView?.image = image }
      }.resume()
    }
    addSubview(imageView)
  }

  private func configureVideo(uri: String) {
    guard let url = Self.url(from: uri) else { return }
    let player = AVPlayer(url: url)
    let layer = AVPlayerLayer(player: player)
    layer.videoGravity = .resizeAspect
    self.player = player
    self.playerLayer = layer
    self.layer.addSublayer(layer)
    player.play()
  }

  private static func url(from raw: String) -> URL? {
    if let url = URL(string: raw), url.scheme != nil { return url }
    return URL(fileURLWithPath: raw)
  }
}
