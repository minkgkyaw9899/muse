Pod::Spec.new do |s|
  s.name           = 'MupdfRenderer'
  s.version        = '1.0.0'
  s.summary        = 'Native MuPDF renderer for Muse'
  s.description    = 'Local Expo module wrapping a pinned MuPDF build. Development builds only until ADR 0001 accepts a licensing path.'
  s.author         = 'Muse'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.license        = { :type => 'AGPL-3.0', :text => 'MuPDF is AGPL-3.0; see docs/adr/0001-mupdf-native-renderer.md' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # MuPDF is opt-in: scripts/build-mupdf.sh builds this framework from a pinned, checksummed archive.
  # Without it the module compiles as a stub (no MuPDF code), which is what preview and production
  # builds get until docs/adr/0001-mupdf-native-renderer.md accepts a licensing path.
  framework = File.join(__dir__, 'Frameworks', 'MuPDF.xcframework')
  xcconfig = { 'DEFINES_MODULE' => 'YES' }
  if File.exist?(framework)
    s.vendored_frameworks = 'Frameworks/MuPDF.xcframework'
    xcconfig['GCC_PREPROCESSOR_DEFINITIONS'] = '$(inherited) MUSE_HAS_MUPDF=1'
    xcconfig['HEADER_SEARCH_PATHS[sdk=iphoneos*]'] = '"$(PODS_TARGET_SRCROOT)/Frameworks/MuPDF.xcframework/ios-arm64/Headers"'
    xcconfig['HEADER_SEARCH_PATHS[sdk=iphonesimulator*]'] = '"$(PODS_TARGET_SRCROOT)/Frameworks/MuPDF.xcframework/ios-arm64-simulator/Headers"'
  end
  s.pod_target_xcconfig = xcconfig

  # Only the module's own sources: the vendored MuPDF headers must not be compiled as sources.
  s.source_files = '*.{h,c,swift}'
  s.public_header_files = 'MuseInspect.h'
  s.preserve_paths = 'Frameworks/**/*'
end
