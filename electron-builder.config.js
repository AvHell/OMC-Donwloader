const packageConfig = require('./package.json');
const buildConfig = { ...packageConfig.build };
const repositoryValue = process.env.GH_REPOSITORY || process.env.GITHUB_REPOSITORY || '';
const match = repositoryValue.match(/(?:github\.com[/:])?([^/:\s]+)\/([^/:\s]+?)(?:\.git)?$/i);

if (match) {
  const [, owner, repo] = match;
  buildConfig.publish = [{ provider: 'github', owner, repo }];
  buildConfig.extraMetadata = {
    ...buildConfig.extraMetadata,
    repository: {
      type: 'git',
      url: `https://github.com/${owner}/${repo}.git`,
    },
  };
} else {
  delete buildConfig.publish;
  console.warn('GH_REPOSITORY no está definido; este build no incluirá publicación/actualizaciones de GitHub.');
}

module.exports = buildConfig;
