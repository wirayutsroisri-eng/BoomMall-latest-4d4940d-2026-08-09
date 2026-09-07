Pod::Spec.new do |s|
  s.name           = 'BoomMallNativeMediaEditor'
  s.version        = '0.1.0'
  s.summary        = 'BoomMall native iOS media editor'
  s.description    = 'Local Expo module that presents the BoomMall native media editor.'
  s.license        = { :type => 'MIT' }
  s.author         = 'BoomMall'
  s.homepage       = 'https://boommall.app'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
