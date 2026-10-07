Pod::Spec.new do |s|
  s.name           = 'NativeTabBounce'
  s.version        = '1.0.0'
  s.summary        = 'A guarded SF Symbol bounce for the native Muse tab bar'
  s.description    = 'Animates the uniquely matching selected tab icon without replacing native navigation.'
  s.author         = 'Muse'
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = {
    :ios => '16.4'
  }
  s.source         = { git: 'https://github.com/minkgkyaw9899/muse.git' }
  s.license        = { :type => 'MIT', :file => '../LICENSE' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
