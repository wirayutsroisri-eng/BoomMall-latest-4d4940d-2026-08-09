import ExpoModulesCore
import UIKit

public final class NativeMediaEditorModule: Module {
  private weak var activeController: NativeMediaEditorViewController?

  public func definition() -> ModuleDefinition {
    Name("BoomMallNativeMediaEditor")

    AsyncFunction("openEditor") { (inputJSON: String, promise: Promise) in
      Task { @MainActor [weak self] in
        guard let self else { return }
        guard self.activeController == nil else {
          promise.reject(EditorAlreadyOpenException())
          return
        }
        guard let presenter = self.appContext?.utilities?.currentViewController() else {
          promise.reject(EditorPresenterMissingException())
          return
        }

        do {
          let input = try JSONDecoder().decode(NativeEditorInput.self, from: Data(inputJSON.utf8))
          let controller = NativeMediaEditorViewController(input: input)
          self.activeController = controller
          controller.onComplete = { [weak self] result in
            defer { self?.activeController = nil }
            do {
              let data = try JSONEncoder().encode(result)
              guard let json = String(data: data, encoding: .utf8) else {
                promise.reject(EditorEncodingException())
                return
              }
              promise.resolve(json)
            } catch {
              promise.reject(error)
            }
          }
          presenter.present(controller, animated: true)
        } catch {
          promise.reject(error)
        }
      }
    }
    .runOnQueue(.main)
  }
}

private final class EditorAlreadyOpenException: Exception {
  override var reason: String { "A native media editor session is already open." }
}

private final class EditorPresenterMissingException: Exception {
  override var reason: String { "Cannot find the active iOS view controller." }
}

private final class EditorEncodingException: Exception {
  override var reason: String { "Cannot encode the native media editor result." }
}
