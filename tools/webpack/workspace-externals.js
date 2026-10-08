const WORKSPACE_SCOPE = '@pocast/';

function isBareImport(request) {
  return (
    !request.startsWith('.') &&
    !request.startsWith('/') &&
    !/^[a-zA-Z]:[\\/]/.test(request)
  );
}

function workspaceExternals({ request }, callback) {
  if (
    request &&
    isBareImport(request) &&
    !request.startsWith(WORKSPACE_SCOPE)
  ) {
    return callback(null, `commonjs ${request}`);
  }
  return callback();
}

module.exports = { workspaceExternals };
