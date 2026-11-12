const { withPodfile, withXcodeProject } = require('expo/config-plugins');

// Quote Expo's generated Constants and React Native bundle script paths.
// Keep the fix in prebuild configuration so regenerating ios/ retains it.
module.exports = function withIosScriptPaths(config) {
  config = withXcodeProject(config, (mod) => {
    for (const phase of Object.values(mod.modResults.hash.project.objects.PBXShellScriptBuildPhase)) {
      if (typeof phase !== 'object' || !phase.shellScript) continue;
      const script = JSON.parse(phase.shellScript);
      const fixed = script.split('\n').map(line => {
        if (line.startsWith('`"$NODE_BINARY"') && line.includes('react-native-xcode.sh')) {
          return '/bin/bash "$(' + line.slice(1, -1) + ')"';
        }
        return line;
      }).join('\n');
      phase.shellScript = JSON.stringify(fixed);
    }
    return mod;
  });
  return withPodfile(config, (mod) => {
    const marker = '# Transactions: quote Expo Constants script path';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents += `
${marker}
post_integrate do |installer|
  project = installer.pods_project
  project.targets.each do |target|
    next unless target.name == 'EXConstants'
    target.shell_script_build_phases.each do |phase|
      if phase.shell_script.include?('get-app-config-ios.sh')
        phase.shell_script = 'bash -l "' + '$' + '{PODS_TARGET_SRCROOT}/../scripts/get-app-config-ios.sh"'
      end
    end
  end
  project.save
end
`;
    }
    return mod;
  });
};
